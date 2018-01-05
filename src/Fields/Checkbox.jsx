import React from 'react';
import createField from '../createField';

class Checkbox extends React.Component {
  render() {
    return (<input { ...this.props } />);
  }
}

export default createField({
  valueProp: 'checked',
  mapPropsToField: props => ({
    ...props,
    type: 'checkbox',
    initialValue: props.checked
  }),
  enforceProps: (props, contextProps) => ({
    checked: contextProps.get('checked')
  })
})(Checkbox);
