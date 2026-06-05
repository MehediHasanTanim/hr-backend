import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmployeeForm } from './EmployeeForm';
import type { EmployeeFormValues } from '../schemas/employee.schema';

const lookups = {
  departments: [{ id: 'dept-1', name: 'HR', code: 'HR', isActive: true }],
  jobTitles: [{ id: 'job-1', title: 'HR Manager' }],
  payGrades: [{ id: 'grade-1', name: 'G5', code: 'G5' }],
  locations: [{ id: 'loc-1', name: 'Dhaka', code: 'DHK' }],
};

function renderForm(onSubmit = vi.fn(), isSaving = false) {
  render(
    <EmployeeForm
      {...lookups}
      isSaving={isSaving}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

async function fillValidForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText(/first name/i), 'Tanvir');
  await user.type(screen.getByLabelText(/last name/i), 'Ahmed');
  await user.type(screen.getByLabelText(/^email$/i), 'tanvir@example.com');
  await user.type(screen.getByLabelText(/phone/i), '+8801711111111');
  await user.type(screen.getByLabelText(/employee number/i), 'EMP-001');
  await user.type(screen.getByLabelText(/joining date/i), '2026-05-29');
  await user.type(screen.getByLabelText(/work email/i), 'tanvir@company.com');
  await user.type(screen.getByLabelText(/bank name/i), 'City Bank');
  await user.type(screen.getByLabelText(/account holder name/i), 'Tanvir Ahmed');
  await user.type(screen.getByLabelText(/account number/i), '1234567890');
  await user.type(screen.getByLabelText(/routing number/i), '987654321');
}

describe('EmployeeForm validation', () => {
  it('shows required field validation errors', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.click(screen.getByRole('button', { name: /save employee/i }));

    expect(await screen.findByText(/first name is required/i)).toBeInTheDocument();
    expect(screen.getByText(/employee number is required/i)).toBeInTheDocument();
    expect(screen.getByText(/bank name is required/i)).toBeInTheDocument();
  });

  it('shows invalid email validation errors', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/^email$/i), 'not-an-email');
    await user.type(screen.getByLabelText(/work email/i), 'also-bad');
    await user.click(screen.getByRole('button', { name: /save employee/i }));

    expect(await screen.findByText(/valid personal email/i)).toBeInTheDocument();
    expect(screen.getByText(/valid work email/i)).toBeInTheDocument();
  });

  it('shows invalid phone validation error', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/phone/i), 'abc');
    await user.click(screen.getByRole('button', { name: /save employee/i }));

    expect(await screen.findByText(/valid phone number/i)).toBeInTheDocument();
  });

  it('submits valid form values successfully', async () => {
    const user = userEvent.setup();
    const onSubmit = renderForm();

    await fillValidForm();
    await user.click(screen.getByRole('button', { name: /save employee/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toEqual(expect.objectContaining<Partial<EmployeeFormValues>>({
      firstName: 'Tanvir',
      employeeNumber: 'EMP-001',
      workEmail: 'tanvir@company.com',
      accountNumber: '1234567890',
    }));
  });

  it('requires bank account fields', async () => {
    const user = userEvent.setup();
    renderForm();

    await user.type(screen.getByLabelText(/first name/i), 'Tanvir');
    await user.type(screen.getByLabelText(/last name/i), 'Ahmed');
    await user.type(screen.getByLabelText(/^email$/i), 'tanvir@example.com');
    await user.type(screen.getByLabelText(/phone/i), '+8801711111111');
    await user.type(screen.getByLabelText(/employee number/i), 'EMP-001');
    await user.type(screen.getByLabelText(/joining date/i), '2026-05-29');
    await user.type(screen.getByLabelText(/work email/i), 'tanvir@company.com');
    await user.click(screen.getByRole('button', { name: /save employee/i }));

    expect(await screen.findByText(/account number is required/i)).toBeInTheDocument();
  });

  it('disables submit while saving', () => {
    renderForm(vi.fn(), true);
    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });
});
