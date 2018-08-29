/**
 * Record utils.
 * A collection of pure helper functions which perform field record updates.
 * Each function takes a field record and additional parameters and returns
 * the next state of the field record.
 */
import curry from 'ramda/src/curry'
import assocPath from 'ramda/src/assocPath'
import { Record } from 'immutable'

/**
 * Generates a Field class relative to the given initial props.
 * Abstraction over a simple Record in order to insert field-specific
 * properties to it (i.e. "valuePropName", "checked", etc.).
 */
const generateFieldClass = (initialProps) => {
  const { valuePropName } = initialProps
  const value = initialProps[valuePropName]

  //
  // TODO
  // Field record must contain ALL the initial data specific to the field.
  // For example, type: "radio" for "radio" fields, proper initialValue, rule, asyncRule,
  // reactiveProps, etc.
  //
  const FieldRecord = new Record(
    {
      /* Internal */
      ref: null,
      fieldGroup: null,
      fieldPath: null,

      /* Basic */
      type: 'text',
      initialValue: value, // TODO Shouldn't this be set here?
      [valuePropName]: value,
      valuePropName: 'value',

      // TODO "radio" field cannot propagate "checked" prop, not in the record
      focused: false,
      checked: null,
      skip: false,

      /* Validation */
      rule: null,
      asyncRule: null,
      pendingAsyncValidation: null,
      debounceValidate: null,
      errors: null,
      expected: true,
      valid: false,
      invalid: false,
      validating: false,
      validated: false,
      validatedSync: false,
      validSync: false,
      validatedAsync: false,
      validAsync: false,
      required: false,

      reactiveProps: null,

      /* Event callbacks/handlers */
      onFocus: null,
      onChange: null,
      onBlur: null,

      ...initialProps,
    },
    'FieldRecord',
  )

  return class Field extends FieldRecord {
    // get fieldPath() {
    //   const fieldGroup = this.fieldGroup || []
    //   return fieldGroup.concat(this.name)
    // }

    get displayFieldPath() {
      return this.fieldPath.join('.')
    }
  }
}

/**
 * Creates a new field record based on the given initial props.
 * @param {Object} initialProps
 * @returns {Field}
 */
export const createField = (initialProps) => {
  const FieldProps = generateFieldClass(initialProps)
  return new FieldProps(initialProps)
}

/**
 * Updates the given collection with the given field props.
 * @param {Field} fieldProps
 * @param {Map} collection
 */
export const updateCollectionWith = curry((fieldProps, collection) => {
  return assocPath(fieldProps.fieldPath, fieldProps, collection)
})

/**
 * Returns the value of the given field.
 * @param {Field} fieldProps
 * @returns {any}
 */
export const getValue = (fieldProps) => {
  return fieldProps[fieldProps.valuePropName]
}

/**
 * Updates the value prop of the given field with the given next value.
 * @param {Map} fieldProps
 * @param {any} nextValue
 */
export const setValue = curry((nextValue, fieldProps) => {
  return fieldProps.set(fieldProps.get('valuePropName'), nextValue)
})

/**
 * Sets the given error messages to the given field.
 * When no errors are provided, returns field props intact.
 * @param {FieldProps} fieldProps
 * @param {FieldProps} errors
 */
export const setErrors = curry((errors, fieldProps) => {
  /* Allow "null" as explicit empty "errors" value */
  return typeof errors !== 'undefined'
    ? fieldProps.set('errors', errors)
    : fieldProps
})

/**
 * Resets the validity state (valid/invalid) of the given field.
 * @param {FieldProps} fieldProps
 * @returns {FieldProps}
 */
export const resetValidityState = curry((fieldProps) => {
  return fieldProps.merge({
    valid: false,
    invalid: false,
  })
})

/**
 * Sets the validity state props (valid/invalid) on the given field.
 * @param {Map} fieldProps
 * @param {Boolean} shouldValidate
 * @returns {Map}
 */
export const updateValidityState = curry((shouldValidate, fieldProps) => {
  if (!shouldValidate) {
    return resetValidityState(fieldProps)
  }

  const { validated, expected } = fieldProps
  const value = getValue(fieldProps)

  return fieldProps.merge({
    valid: !!value && validated && expected,
    invalid: validated && !expected,
  })
})

/**
 * Resets the validation state of the given field.
 * @param {Map} fieldProps
 * @returns {Map}
 */
export const resetValidationState = curry((fieldProps) => {
  return fieldProps.merge({
    validating: false,
    validated: false,
    validatedSync: false,
    validatedAsync: false,
    validSync: false,
    validAsync: false,
  })
})

/**
 * Resets the given field to its initial state.
 * @param {Map} fieldProps
 * @returns {Map}
 */
export const reset = curry((fieldProps) => {
  return fieldProps.clear()
})

/**
 * Sets the given field's focus.
 * @param {Map} fieldProps
 * @param {Boolean} isFocused
 * @returns {Map}
 */
export const setFocus = curry((isFocused, fieldProps) => {
  return fieldProps.set('focused', isFocused)
})
