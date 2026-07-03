export async function seedLeaveBalance(
  prisma: any,
  employeeId: string,
  leaveTypeId: string,
  year: number,
  entitled: number,
  used: number = 0,
): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO leave_balances (employee_id, leave_type_id, year, entitled, used, balance)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (employee_id, leave_type_id, year) DO UPDATE
     SET entitled = $4, used = $5, balance = $6`,
    employeeId,
    leaveTypeId,
    year,
    entitled,
    used,
    entitled - used,
  );
}
