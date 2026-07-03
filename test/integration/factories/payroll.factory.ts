export async function seedSalaryStructure(
  prisma: any,
  companyId: string,
  employeeId: string,
  overrides: {
    basicSalary?: number;
    houseAllowance?: number;
    transportAllowance?: number;
  } = {},
): Promise<void> {
  // Create a simple salary structure and assign to employee
  await prisma.$executeRawUnsafe(
    `INSERT INTO salary_structures (company_id, name, is_active)
     VALUES ($1, 'Test Structure', true)
     ON CONFLICT DO NOTHING`,
    companyId,
  );

  const structures = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT id FROM salary_structures WHERE company_id = $1 LIMIT 1`,
    companyId,
  );

  if (structures.length > 0) {
    await prisma.$executeRawUnsafe(
      `INSERT INTO employee_salaries (employee_id, structure_id, company_id, ctc, effective_from, status)
       VALUES ($1, $2, $3, $4, '2024-01-01', 'APPROVED')
       ON CONFLICT DO NOTHING`,
      employeeId,
      structures[0].id,
      companyId,
      (overrides.basicSalary ?? 50000) + (overrides.houseAllowance ?? 10000) + (overrides.transportAllowance ?? 5000),
    );
  }
}
