Object.defineProperty(globalThis, 'import', {
  value: { meta: { env: {} } },
  writable: true,
}); 