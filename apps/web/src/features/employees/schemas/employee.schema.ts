import { z } from 'zod';

const phoneRegex = /^[+()0-9\-\s]{7,20}$/;

export const employeeFormSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid personal email'),
  phone: z.string().regex(phoneRegex, 'Enter a valid phone number'),
  dateOfBirth: z.string().optional(),
  gender: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY']).optional(),
  ),
  nationalId: z.string().optional(),
  passportNumber: z.string().optional(),
  employeeNumber: z.string().min(1, 'Employee number is required'),
  employmentType: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERN']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ON_LEAVE', 'TERMINATED']),
  joinedAt: z.string().min(1, 'Joining date is required'),
  probationEndsAt: z.string().optional(),
  workEmail: z.string().email('Enter a valid work email'),
  departmentId: z.string().optional(),
  jobTitleId: z.string().optional(),
  payGradeId: z.string().optional(),
  managerId: z.string().optional(),
  locationId: z.string().optional(),
  bankName: z.string().min(1, 'Bank name is required'),
  branchName: z.string().optional(),
  accountName: z.string().min(1, 'Account holder name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  routingNumber: z.string().min(1, 'Routing number is required'),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;

export const defaultEmployeeFormValues: EmployeeFormValues = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  dateOfBirth: '',
  gender: undefined,
  nationalId: '',
  passportNumber: '',
  employeeNumber: '',
  employmentType: 'FULL_TIME',
  status: 'ACTIVE',
  joinedAt: '',
  probationEndsAt: '',
  workEmail: '',
  departmentId: '',
  jobTitleId: '',
  payGradeId: '',
  managerId: '',
  locationId: '',
  bankName: '',
  branchName: '',
  accountName: '',
  accountNumber: '',
  routingNumber: '',
};
