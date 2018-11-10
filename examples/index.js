import React from 'react'
import { storiesOf } from '@storybook/react'
import { action } from '@storybook/addon-actions'
import 'bootstrap/dist/css/bootstrap.min.css'

function logSerialized({ serialized }) {
  return action('serialized')(serialized)
}

function addComponent(Component) {
  return () => (
    <Component.type {...Component.props} onSubmitStart={logSerialized} />
  )
}

/* Basics */
import InitialValues from './basics/InitialValues'
import SetValues from './basics/SetValues'
import Reset from './basics/Reset'
import Serialize from './basics/Serialize'
import UncontrolledFields from './basics/UncontrolledFields'
import ControlledFields from './basics/ControlledFields'
import SubmitCallbacks from './basics/SubmitCallbacks'
import Submit from './basics/Submit'

/* Components */
import CreateField from './components/createField'
import FormProvider from './components/FormProvider/DebounceTime'

/* Field grouping */
import FieldGrouping from './field-grouping/FieldGrouping'

/* Validation */
import FieldPropsRule from './validation/sync/Field.props.rule'
import FormPropsRules from './validation/sync/Form.props.rules'
import FieldPropsAsyncRule from './validation/async/Field.props.asyncRule'

import CombinedValidation from './validation/combined'
import SetErrors from './validation/messages/SetErrors'
import ValidationUI from './validation/misc/UI'
import AjaxPrefilling from './validation/misc/AjaxPrefilling'

import ValidationMessages from './validation/messages/ValidationMessages'

/* Reactive props */
import RxPropsFieldReactiveRule from './reactive-props/FieldReactiveRule'
import RxPropsDynamicRequired from './reactive-props/DynamicRequired'
import RxPropsSingleTarget from './reactive-props/SingleTarget'
import RxPropsInterdependent from './reactive-props/Interdependent'
import RxPropsDelegatedSubscription from './reactive-props/DelegatedSubscription'

/* Custom fields */
import BirthDateExample from './custom-fields/BirthDate'

/* Full examples */
import RegistrationForm from './full/RegistrationForm'

/* Third-party fields integration */
import ReactSelect from './third-party/react-select'
import ReactSlider from './third-party/react-slider'
import ReactDatepicker from './third-party/react-datepicker'

/* Components */
storiesOf('Components', module)
  .add('createField', addComponent(<CreateField />))
  .add('FormProvider', addComponent(<FormProvider />))

storiesOf('Behavior', module).add(
  'Validation UI',
  addComponent(<ValidationUI />),
)

/* Basics */
storiesOf('Basics|Interaction', module)
  .add('Initial values', addComponent(<InitialValues />))
  .add('Set values', addComponent(<SetValues />))
  .add('Reset', addComponent(<Reset />))
  .add('Serialize', addComponent(<Serialize />))
  .add('Uncontrolled fields', addComponent(<UncontrolledFields />))
  .add('Controlled fields', addComponent(<ControlledFields />))
  .add('Form submit', addComponent(<Submit />))
  .add('Submit callbacks', addComponent(<SubmitCallbacks />))

/* Validation */
storiesOf('Validation|Synchronous validation', module)
  .add('Field rules', addComponent(<FieldPropsRule />))
  .add('Form rules', addComponent(<FormPropsRules />))

storiesOf('Validation|Asynchronous validation', module).add(
  'Field async rule',
  addComponent(<FieldPropsAsyncRule />),
)

storiesOf('Validation|Combined validation', module).add(
  'Combined validation',
  addComponent(<CombinedValidation />),
)

storiesOf('Validation|Messages', module)
  .add('Validation messages', addComponent(<ValidationMessages />))
  .add('Set errors', addComponent(<SetErrors />))

storiesOf('Validation|Misc', module).add(
  'Ajax pre-filling',
  addComponent(<AjaxPrefilling />),
)

/* Advanced */
storiesOf('Advanced|Custom fields', module).add(
  'BirthDate',
  addComponent(<BirthDateExample />),
)

storiesOf('Advanced|Field grouping', module).add(
  'Field grouping',
  addComponent(<FieldGrouping />),
)

storiesOf('Advanced|Reactive props', module)
  .add('Reactive field rule', addComponent(<RxPropsFieldReactiveRule />))
  .add('Dynamic required', addComponent(<RxPropsDynamicRequired />))
  .add('Single field target', addComponent(<RxPropsSingleTarget />))
  .add('Interdependent fields', addComponent(<RxPropsInterdependent />))
  .add('Delegated subscription', addComponent(<RxPropsDelegatedSubscription />))

/* Other */
storiesOf('Other|Third-party fields', module)
  .add('react-select', addComponent(<ReactSelect />))
  .add('react-rangeslider', addComponent(<ReactSlider />))
  .add('react-datepicker', addComponent(<ReactDatepicker />))

storiesOf('Other|Full examples', module).add(
  'Registration Form',
  addComponent(<RegistrationForm />),
)
