import invariant from 'invariant'
import React from 'react'
import PropTypes from 'prop-types'
import { EventEmitter } from 'events'
import { fromJS, Record, List, Map } from 'immutable'
import { Observable } from 'rxjs/Observable'
import 'rxjs/add/operator/bufferTime'
import 'rxjs/add/observable/fromEvent'

/* Internal modules */
import {
  defaultDebounceTime,
  ValidationRulesPropType,
  ValidationMessagesPropType,
} from './FormProvider'
import {
  CustomPropTypes,
  isset,
  camelize,
  dispatch,
  flattenDeep,
  recordUtils,
  fieldUtils,
  formUtils,
  rxUtils,
} from '../utils'
import * as composites from '../utils/composites'
import validate from '../utils/composites/validateField'

/**
 * Binds the component's reference to the function's context and calls
 * an optional callback function to access that reference.
 * @param {HTMLElement} element
 * @param {Function} callback
 */
function getInnerRef(element, callback) {
  this.innerRef = element

  if (callback) {
    callback(element)
  }
}

function filterFields(entity) {
  return !!entity.fieldPath
}

export default class Form extends React.Component {
  static propTypes = {
    /* General */
    innerRef: PropTypes.func, // reference to the <form> element
    action: PropTypes.func.isRequired, // form submit action

    /* Validation */
    rules: ValidationRulesPropType,
    messages: ValidationMessagesPropType,

    /* Events */
    onFirstChange: PropTypes.func,
    onReset: PropTypes.func,
    onInvalid: PropTypes.func,
    onSubmitStart: PropTypes.func, // form should submit, submit started
    onSubmitted: PropTypes.func, // form submit went successfully
    onSubmitFailed: PropTypes.func, // form submit failed
    onSubmitEnd: PropTypes.func, // form has finished submit (regardless of the result)
  }

  static defaultProps = {
    action: () => new Promise((resolve) => resolve()),
  }

  state = {
    fields: Map(),
    rxRules: Map(),
    dirty: false,
  }

  /* Context accepted by the Form */
  static contextTypes = {
    rules: CustomPropTypes.Map,
    messages: CustomPropTypes.Map,
    debounceTime: PropTypes.number,
    withImmutable: PropTypes.bool,
  }

  /* Context propagated to the fields */
  static childContextTypes = {
    fields: CustomPropTypes.Map.isRequired,
    form: PropTypes.object.isRequired,
  }

  getChildContext() {
    return {
      fields: this.state.fields,
      form: this,
    }
  }

  constructor(props, context) {
    super(props, context)
    const { rules: explicitRules, messages: explicitMessages } = props
    const { debounceTime, rules, messages } = context

    /* Provide a fallback value for validation debounce duration */
    this.debounceTime = isset(debounceTime) ? debounceTime : defaultDebounceTime

    /* Define validation rules */
    this.formRules = formUtils.mergeRules(explicitRules, rules)

    /**
     * Define validation messages once, since those should be converted
     * to immutable, which is an expensive procedure. Moreover, messages
     * are unlikely to change during the component's lifecycle. It should
     * be safe to store them.
     * Note: Messages passed from FormProvider (context messages) are
     * already immutable.
     */
    this.messages = explicitMessages ? fromJS(explicitMessages) : messages

    /* Create an event emitter to communicate between form and its fields */
    const eventEmitter = new EventEmitter()
    this.eventEmitter = eventEmitter

    /* Field lifecycle observerables */
    Observable.fromEvent(eventEmitter, 'fieldRegister')
      .bufferTime(100)
      .subscribe((pendingFields) => pendingFields.forEach(this.registerField))
    Observable.fromEvent(eventEmitter, 'fieldFocus').subscribe(
      this.handleFieldFocus,
    )
    Observable.fromEvent(eventEmitter, 'fieldChange').subscribe(
      this.handleFieldChange,
    )
    Observable.fromEvent(eventEmitter, 'fieldBlur').subscribe(
      this.handleFieldBlur,
    )
    Observable.fromEvent(eventEmitter, 'fieldUnregister').subscribe(
      this.unregisterField,
    )
    Observable.fromEvent(eventEmitter, 'validateField').subscribe(
      this.validateField,
    )
  }

  ensafeHandler = (handlerFunc) => {
    return (args) => {
      const { fieldProps } = args
      return this.state.fields.hasIn(fieldProps.fieldPath) && handlerFunc(args)
    }
  }

  /**
   * Maps the field to the state/context.
   * Passing fields in context gives a benefit of removing an explicit traversing of
   * children tree, deconstructing and constructing each appropriate child with the
   * attached handler props.
   * @param {Record} fieldProps
   */
  registerField = ({ fieldProps: initialFieldProps, fieldOptions }) => {
    const { fields } = this.state
    const { fieldPath } = initialFieldProps
    const fieldAlreadyExists = fields.hasIn(fieldPath)

    console.groupCollapsed(
      `Form @ registerField @ ${initialFieldProps.displayFieldPath}`,
    )
    console.log('field options:', fieldOptions)
    console.log('initial field record:', initialFieldProps.toJS())
    console.log('field already exists?', fieldAlreadyExists)

    /* Warn on field duplicates */
    invariant(
      !(fieldAlreadyExists && !fieldOptions.allowMultiple),
      'Cannot register field `%s`, the field with ' +
        'the provided name is already registered. Make sure the fields on the same level of `Form` ' +
        'or `Field.Group` have unique names.',
      fieldPath,
    )

    console.log('calling "beforeRegister" hook to alter field record...')
    console.log('"beforeRegister" method:', fieldOptions.beforeRegister)

    /* Perform custom field props transformations upon registration */
    const fieldProps = fieldOptions.beforeRegister({
      fieldProps: initialFieldProps,
      fields,
    })

    console.log('`beforeRegister` hook called successfully!')
    console.log(
      'fieldProps after "beforeRegister":',
      fieldProps && fieldProps.toJS(),
    )

    if (!fieldProps) {
      return
    }

    const nextFields = fields.setIn(fieldPath, fieldProps)
    const { eventEmitter } = this

    console.log('next fields:', nextFields && nextFields.toJS())

    /**
     * Synchronize the field record with the field component's props.
     * Create a props change observer to keep field's record in sync with
     * the props changes of the respective field component. Only the changes
     * in the props relative to the record should be observed and synchronized.
     */
    rxUtils
      .createPropsObserver({
        targetFieldPath: fieldPath,
        props: ['type'],
        eventEmitter,
      })
      .subscribe(({ nextTargetRecord, changedProps }) => {
        //
        // TODO Test if this replaces the previous logic.
        //
        const nextFieldProps = nextTargetRecord.merge(changedProps)
        this.updateFieldsWith(nextFieldProps)

        // this.updateField({
        //   fieldPath,
        //   update: (fieldProps) =>
        //     Object.keys(changedProps).reduce((acc, propName) => {
        //       return acc.set(propName, changedProps[propName])
        //     }, fieldProps),
        // })
      })

    console.log('props observers created!')

    /**
     * Analyze the rules relevant to the registered field and create
     * reactive subscriptions to resolve them once their dependencies
     * update. Returns the Map of the recorded formatted rules.
     * That Map is later used during the sync validation as the rules source.
     */
    const nextRxRules = rxUtils.createRulesSubscriptions({
      fieldProps,
      fields,
      form: this,
    })

    console.log('next rx rules composed:', nextRxRules && nextRxRules.toJS())
    console.groupEnd()

    this.setState(
      {
        fields: nextFields,
        rxRules: nextRxRules,
      },
      () => {
        const fieldRegisteredEvent = camelize(...fieldPath, 'registered')
        eventEmitter.emit(fieldRegisteredEvent, fieldProps)

        if (fieldOptions.shouldValidateOnMount) {
          this.validateField({
            __SOURCE__: 'validateOnMount',
            fieldProps,

            /**
             * Enforce the validation function to use the "fieldProps"
             * provided directly. By default, it will try to grab the
             * field record from the state, which is missing at this
             * point of execution.
             */
            forceProps: true,
          })
        }

        /* Create reactive props subscriptions */
        rxUtils.createPropsSubscriptions({
          fieldProps,
          fields: nextFields,
          form: this,
        })
      },
    )
  }

  /**
   * Updates the fields with the given instance of the field and returns
   * the updated state of the fields.
   * @param {Record} fieldProps
   * @returns {Promise}
   */
  updateFieldsWith = (fieldProps) => {
    const nextFields = recordUtils.updateCollectionWith(
      fieldProps,
      this.state.fields,
    )

    console.groupCollapsed(
      `Form @ updateFieldsWith @ ${fieldProps.displayFieldPath}`,
    )
    console.log('field props:', fieldProps.toJS())
    console.log('next fields:', nextFields.toJS())
    console.groupEnd(' ')

    return new Promise((resolve, reject) => {
      try {
        this.setState({ fields: nextFields }, resolve.bind(this, nextFields))
      } catch (error) {
        reject(error)
      }
    })
  }

  /**
   * Deletes the field record from the state.
   * @param {Record} fieldProps
   */
  unregisterField = (fieldProps) => {
    this.setState((prevState) => ({
      fields: prevState.fields.deleteIn(fieldProps.fieldPath),
    }))
  }

  /**
   * Handles the first field change of the form.
   * @param {Event} event
   * @param {any} nextValue
   * @param {any} prevValue
   * @param {Record} fieldProps
   */
  handleFirstChange = ({ event, prevValue, nextValue, fieldProps }) => {
    const { onFirstChange } = this.props
    if (!onFirstChange) {
      return
    }

    dispatch(
      onFirstChange,
      {
        event,
        nextValue,
        prevValue,
        fieldProps,
        fields: this.state.fields,
        form: this,
      },
      this.context,
    )

    this.setState({ dirty: true })
  }

  /**
   * Handles field focus.
   * @param {Event} event
   * @param {Record} fieldProps
   */
  handleFieldFocus = this.ensafeHandler((args) => {
    const { fields } = this.state
    const { nextFields } = composites.handleFieldFocus(args, fields, this)
    this.setState({ fields: nextFields })
  })

  /**
   * Handles field change.
   * @param {Event} event
   * @param {Record} fieldProps
   * @param {mixed} prevValue
   * @param {mixed} nextValue
   */
  handleFieldChange = this.ensafeHandler(async (args) => {
    const { fields, dirty } = this.state
    const { nextFieldProps } = await composites.handleFieldChange(
      args,
      fields,
      this,
      {
        onUpdateValue: this.updateFieldsWith,
      },
    )

    this.updateFieldsWith(nextFieldProps)

    /* Mark form as dirty if it's not already */
    if (!dirty) {
      this.handleFirstChange(args)
    }
  })

  /**
   * Handles field blur.
   * @param {Event} event
   * @param {Record} fieldProps
   */
  handleFieldBlur = this.ensafeHandler(async (args) => {
    const { fields } = this.state
    const { nextFields } = await composites.handleFieldBlur(args, fields, this)
    this.setState({ fields: nextFields })
  })

  /**
   * Validates the provided field with the additional options.
   */
  validateField = async (args) => {
    const {
      __SOURCE__,
      chain,
      force = false,
      fieldProps: explicitFieldProps,
      fields: explicitFields,
      forceProps = false,
      shouldUpdateFields = true,
    } = args

    const fields = explicitFields || this.state.fields

    let fieldProps = forceProps
      ? explicitFieldProps
      : fields.getIn(explicitFieldProps.fieldPath)
    fieldProps = fieldProps || explicitFieldProps

    console.groupCollapsed(
      `Form @ validateField @ ${fieldProps.displayFieldPath} @ ${__SOURCE__}`,
    )
    console.warn('stack trace')
    console.log('validation chain:', chain)
    console.log('value:', fieldProps.get(fieldProps.get('valuePropName')))
    console.log('fieldProps', fieldProps.toJS())
    console.log('fields:', fields && fields.toJS())
    console.log('explicit fields:', explicitFields && explicitFields.toJS())
    console.log('should force props?', forceProps)
    console.log('should update fields?', shouldUpdateFields)
    console.groupEnd()

    /* Perform the validation */
    const validatedField = await validate({
      __SOURCE__,
      chain,
      force,
      fieldProps,
      fields,
      form: this,
    })

    console.warn('FORM: validation is done, props:', validatedField)

    /* Update the field in the state to reflect the changes */
    if (shouldUpdateFields) {
      await this.updateFieldsWith(validatedField)
    }

    return validatedField
  }

  /**
   * Performs the validation of each field in parallel, awaiting for all the pending
   * validations to be completed.
   * @param {Function} predicate (Optional) Predicate function to filter the fields.
   */
  validate = async (predicate = filterFields) => {
    const { fields } = this.state
    const flattenedFields = flattenDeep(fields, predicate, true)

    /* Validate only the fields matching the optional selection */
    const validationSequence = flattenedFields.reduce(
      (validations, fieldProps) => {
        return validations.concat(
          this.validateField({
            __SOURCE__: 'Form.validate()',
            fieldProps,
          }),
        )
      },
      [],
    )

    /* Await for all validation promises to resolve before returning */
    const validatedFields = await Promise.all(validationSequence)
    const isFormValid = validatedFields.every((validatedFieldProps) => {
      return validatedFieldProps.expected
    })

    const { onInvalid } = this.props

    if (!isFormValid && onInvalid) {
      const { fields: nextFields } = this.state

      /* Reduce the invalid fields to the ordered Array */
      const invalidFields = List(
        nextFields.filterNot((fieldProps) => fieldProps.expected),
      )

      /* Call custom callback */
      dispatch(
        onInvalid,
        {
          fields: nextFields,
          invalidFields,
          form: this,
        },
        this.context,
      )
    }

    return isFormValid
  }

  /**
   * Resets all the fields to their initial state upon mounting.
   */
  reset = () => {
    const nextFields = this.state.fields.map((fieldProps) =>
      recordUtils.reset(fieldProps),
    )

    this.setState({ fields: nextFields }, () => {
      /**
       * Validate only non-empty fields, since empty required fields
       * should not be unexpected after reset.
       */
      this.validate((entry) => Record.isRecord(entry) && entry.value !== '')

      /* Call custom callback methods to be able to reset controlled fields */
      const { onReset } = this.props
      if (!onReset) {
        return
      }

      dispatch(
        onReset,
        {
          fields: nextFields,
          form: this,
        },
        this.context,
      )
    })
  }

  /**
   * Returns a collection of serialized fields.
   * @returns {Map|Object}
   */
  serialize = () => {
    return fieldUtils.serializeFields(
      this.state.fields,
      this.context.withImmutable,
    )
  }

  /**
   * Submits the form.
   * @param {Event} event
   */
  submit = async (event) => {
    if (event) {
      event.preventDefault()
    }

    console.warn('SUBMIT INVOKED!')

    /* Throw on submit attempt without the "action" prop */
    const { action } = this.props

    invariant(
      action,
      'Cannot submit the form without `action` prop specified explicitly. ' +
        'Expected a function which returns Promise, but received: %s.',
      action,
    )

    /* Ensure form has no unexpected fields and, therefore, should be submitted */
    const shouldSubmit = await this.validate()
    console.log('shouldSubmit?', shouldSubmit)

    if (!shouldSubmit) {
      return
    }

    const { fields } = this.state
    const {
      onSubmitStart,
      onSubmitted,
      onSubmitFailed,
      onSubmitEnd,
    } = this.props

    /* Serialize the fields */
    const serialized = this.serialize()

    /* Compose a single Object of arguments passed to each custom handler */
    const callbackArgs = {
      serialized,
      fields,
      form: this,
    }

    /**
     * Event: Submit has started.
     * The submit is consideres started immediately when the submit button is pressed.
     */
    if (onSubmitStart) {
      dispatch(onSubmitStart, callbackArgs, this.context)
    }

    const dispatchedAction = dispatch(action, callbackArgs, this.context)

    invariant(
      dispatchedAction && typeof dispatchedAction.then === 'function',
      'Cannot submit the form. Expected `action` prop of the Form to return ' +
        'an instance of Promise, but got: %s. Make sure you return a Promise ' +
        'from your action handler.',
      dispatchedAction,
    )

    return dispatchedAction
      .then((res) => {
        if (onSubmitted) {
          dispatch(onSubmitted, { ...callbackArgs, res }, this.context)
        }
        return res
      })
      .catch((res) => {
        if (onSubmitFailed) {
          dispatch(onSubmitFailed, { ...callbackArgs, res }, this.context)
        }
        return res
      })
      .then((res) => {
        if (onSubmitEnd) {
          dispatch(onSubmitEnd, { ...callbackArgs, res }, this.context)
        }
      })
  }

  render() {
    const { innerRef, id, className, children } = this.props

    return (
      <form
        ref={(ref) => getInnerRef.call(this, ref, innerRef)}
        {...{ id }}
        {...{ className }}
        onSubmit={this.submit}
        noValidate
      >
        {children}
      </form>
    )
  }
}
