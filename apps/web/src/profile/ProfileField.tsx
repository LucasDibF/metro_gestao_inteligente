import type { ReactNode } from 'react';
import { brazilianStates } from '../works/work-types';
import {
  profileFieldLimits,
  type ProfileFieldErrors,
  type ProfileFieldName,
  type ProfileFormValues,
} from './professional-profile-form';

export const profileFieldId = (field: ProfileFieldName): string => `profile-${field}`;

interface FieldProps {
  field: ProfileFieldName;
  label: string;
  optional?: boolean;
  help?: ReactNode;
  values: ProfileFormValues;
  errors: ProfileFieldErrors;
  onChange: (field: ProfileFieldName, value: string) => void;
}
function describedBy(field: ProfileFieldName, help: boolean, error: boolean): string | undefined {
  const ids = [
    help ? `${profileFieldId(field)}-help` : '',
    error ? `${profileFieldId(field)}-error` : '',
  ]
    .filter(Boolean)
    .join(' ');
  return ids || undefined;
}
function FieldFrame({
  field,
  label,
  optional,
  help,
  errors,
  children,
}: Omit<FieldProps, 'values' | 'onChange'> & { children: ReactNode }) {
  const id = profileFieldId(field);
  return (
    <div className="profile-field">
      <label htmlFor={id}>
        {label}
        {optional ? <span className="optional"> (opcional)</span> : null}
      </label>
      {children}
      {help ? (
        <p id={`${id}-help`} className="help">
          {help}
        </p>
      ) : null}
      {errors[field] ? (
        <p id={`${id}-error`} className="field-error">
          {errors[field]}
        </p>
      ) : null}
    </div>
  );
}

/** Labelled text input whose help and error are announced with the field. */
export function ProfileTextField({
  type = 'text',
  autoComplete,
  ...props
}: FieldProps & { type?: 'text' | 'email' | 'tel'; autoComplete?: string }) {
  const { field, help, values, errors, onChange } = props;
  return (
    <FieldFrame {...props}>
      <input
        id={profileFieldId(field)}
        name={field}
        type={type}
        autoComplete={autoComplete}
        inputMode={type === 'tel' ? 'tel' : undefined}
        maxLength={profileFieldLimits[field]}
        value={values[field]}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field, Boolean(help), Boolean(errors[field]))}
        onChange={(event) => onChange(field, event.target.value)}
      />
    </FieldFrame>
  );
}

/** Native select with the 27 state codes, empty until the engineer picks one. */
export function ProfileStateField(props: FieldProps) {
  const { field, help, values, errors, onChange } = props;
  return (
    <FieldFrame {...props}>
      <select
        id={profileFieldId(field)}
        name={field}
        value={values[field]}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy(field, Boolean(help), Boolean(errors[field]))}
        onChange={(event) => onChange(field, event.target.value)}
      >
        <option value="">Selecione</option>
        {brazilianStates.map((state) => (
          <option key={state}>{state}</option>
        ))}
      </select>
    </FieldFrame>
  );
}
