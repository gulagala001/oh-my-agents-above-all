import React, { forwardRef } from 'react';
import { Button as NativeButton, Input as NativeInput } from '@deepseek-ai/dsh-client-ui-primitives';

export { Checkbox, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
const classes = (...values) => values.filter(Boolean).join(' ');

// Keep the host's actual controls and native form/fieldset semantics. The rc.2
// primitives do not export a select or multiline input; those two leaves use
// the same tokens without implementing another popup or keyboard controller.
export const Button = forwardRef(function Button({ className, size = 'sm', variant = 'outline', ...props }, ref) {
  return <NativeButton ref={ref} size={size} variant={variant} className={classes('omaa-button', className)} {...props}/>;
});
export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <NativeInput ref={ref} className={classes('omaa-input', className)} {...props}/>;
});
export const Select = forwardRef(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={classes('omaa-select', className)} {...props}/>;
});
export const TextArea = forwardRef(function TextArea({ className, ...props }, ref) {
  return <textarea ref={ref} className={classes('omaa-textarea', className)} {...props}/>;
});
