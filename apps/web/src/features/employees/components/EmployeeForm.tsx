import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card, FieldError, Input, Select, SecondaryButton } from '../../../components/ui';
import type { Department, JobTitle, Location, PayGrade } from '../../org/types/org.types';
import {
  defaultEmployeeFormValues,
  employeeFormSchema,
  type EmployeeFormValues,
} from '../schemas/employee.schema';

interface EmployeeFormProps {
  defaultValues?: Partial<EmployeeFormValues>;
  departments: Department[];
  jobTitles: JobTitle[];
  payGrades: PayGrade[];
  locations: Location[];
  managers?: Array<{ id: string; label: string }>;
  isSaving?: boolean;
  onSubmit: (values: EmployeeFormValues) => void | Promise<void>;
  onSaveDraft?: (values: EmployeeFormValues) => void;
}

export function EmployeeForm({
  defaultValues,
  departments,
  jobTitles,
  payGrades,
  locations,
  managers = [],
  isSaving,
  onSubmit,
  onSaveDraft,
}: EmployeeFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
    getValues,
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: { ...defaultEmployeeFormValues, ...defaultValues },
  });

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormSection title="Personal Information">
        <TextField label="First name" registration={register('firstName')} error={errors.firstName?.message} />
        <TextField label="Last name" registration={register('lastName')} error={errors.lastName?.message} />
        <TextField label="Email" type="email" registration={register('email')} error={errors.email?.message} />
        <TextField label="Phone" registration={register('phone')} error={errors.phone?.message} />
        <TextField label="Date of birth" type="date" registration={register('dateOfBirth')} error={errors.dateOfBirth?.message} />
        <label>
          <span className="mb-1 block text-sm font-medium">Gender</span>
          <Select {...register('gender')}>
            <option value="">Select gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
            <option value="PREFER_NOT_TO_SAY">Prefer not to say</option>
          </Select>
        </label>
        <TextField label="National ID" registration={register('nationalId')} />
        <TextField label="Passport number" registration={register('passportNumber')} />
      </FormSection>

      <FormSection title="Employment Information">
        <TextField label="Employee number" registration={register('employeeNumber')} error={errors.employeeNumber?.message} />
        <label>
          <span className="mb-1 block text-sm font-medium">Employee type</span>
          <Select {...register('employmentType')}>
            <option value="FULL_TIME">Full time</option>
            <option value="PART_TIME">Part time</option>
            <option value="CONTRACT">Contract</option>
            <option value="INTERN">Intern</option>
          </Select>
        </label>
        <label>
          <span className="mb-1 block text-sm font-medium">Employment status</span>
          <Select {...register('status')}>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
            <option value="ON_LEAVE">On leave</option>
            <option value="TERMINATED">Terminated</option>
          </Select>
        </label>
        <TextField label="Joining date" type="date" registration={register('joinedAt')} error={errors.joinedAt?.message} />
        <TextField label="Probation end date" type="date" registration={register('probationEndsAt')} />
        <TextField label="Work email" type="email" registration={register('workEmail')} error={errors.workEmail?.message} />
      </FormSection>

      <FormSection title="Organization Assignment">
        <LookupSelect label="Department" registration={register('departmentId')} items={departments.map((item) => ({ id: item.id, label: item.name }))} />
        <LookupSelect label="Job title" registration={register('jobTitleId')} items={jobTitles.map((item) => ({ id: item.id, label: item.title }))} />
        <LookupSelect label="Pay grade" registration={register('payGradeId')} items={payGrades.map((item) => ({ id: item.id, label: item.name }))} />
        <LookupSelect label="Manager" registration={register('managerId')} items={managers} />
        <LookupSelect label="Location" registration={register('locationId')} items={locations.map((item) => ({ id: item.id, label: item.name }))} />
      </FormSection>

      <FormSection title="Bank Details">
        <TextField label="Bank name" registration={register('bankName')} error={errors.bankName?.message} />
        <TextField label="Branch name" registration={register('branchName')} />
        <TextField label="Account holder name" registration={register('accountName')} error={errors.accountName?.message} />
        <TextField label="Account number" registration={register('accountNumber')} error={errors.accountNumber?.message} />
        <TextField label="Routing number" registration={register('routingNumber')} error={errors.routingNumber?.message} />
      </FormSection>

      <div className="flex flex-wrap justify-end gap-2">
        <SecondaryButton type="button" onClick={() => onSaveDraft?.(getValues())}>Save draft</SecondaryButton>
        <Button type="submit" disabled={isSaving}>
          <Save className="h-4 w-4" />
          {isSaving ? 'Saving...' : 'Save employee'}
        </Button>
      </div>
    </form>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{children}</div>
    </Card>
  );
}

function TextField({
  label,
  type = 'text',
  registration,
  error,
}: {
  label: string;
  type?: string;
  registration: any;
  error?: string | undefined;
}) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <Input type={type} {...registration} aria-invalid={Boolean(error)} />
      <FieldError message={error} />
    </label>
  );
}

function LookupSelect({ label, registration, items }: { label: string; registration: any; items: Array<{ id: string; label: string }> }) {
  return (
    <label>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      <Select {...registration}>
        <option value="">Unassigned</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
      </Select>
    </label>
  );
}
