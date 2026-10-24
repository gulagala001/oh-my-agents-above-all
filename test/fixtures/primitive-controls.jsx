// Behavioral component fixtures only. Real appearance and the host primitive
// implementation are exercised by settings-ui-native.test.mjs.
import React, { forwardRef } from 'react';
export const Button = forwardRef(function Button({ variant, size, icon, children, ...props }, ref) {
  return <button ref={ref} type="button" {...props}>{icon}{children}</button>;
});
export const Input = forwardRef(function Input({ className, icon, ...props }, ref) {
  return <span className={className}>{icon}<input ref={ref} {...props}/></span>;
});
export function Switch({ label, checked, onChange, ...props }) {
  return <button type="button" role="switch" aria-label={label} aria-checked={checked} {...props} onClick={() => onChange(!checked)}/>;
}
export function Checkbox({ label, checked, onChange, className, ...props }) {
  return <label className={className}><input type="checkbox" checked={checked} {...props} onChange={event => onChange(event.target.checked)}/><span>{label}</span></label>;
}
