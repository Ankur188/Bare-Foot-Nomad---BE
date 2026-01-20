(async ()=>{
  try {
    await import('../db.js');
    await import('../routes/static-api.js');
    await import('../routes/images.js');
    console.log('SMOKE OK: modules imported successfully');
  } catch (err) {
    console.error('SMOKE FAIL:', err);
    process.exit(2);
  }
})();
