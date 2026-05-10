function bootstrap(): void {
  console.warn('Worker process initialized');
}

try {
  bootstrap();
} catch (error: unknown) {
  console.error('Worker bootstrap failed', error);
  process.exit(1);
}
