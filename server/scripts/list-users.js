const m = require('mongoose');
m.connect('mongodb://localhost:27017/restaurant_db')
  .then(async () => {
    const users = await m.connection.db.collection('users')
      .find({}, { projection: { email: 1, role: 1, isActive: 1, firstName: 1, lastName: 1 } })
      .toArray();
    console.log('Nombre utilisateurs:', users.length);
    users.forEach(u => console.log(`- ${u.email} | ${u.role} | active=${u.isActive} | ${u.firstName} ${u.lastName}`));
    process.exit(0);
  })
  .catch(e => { console.error('ERR:', e.message); process.exit(1); });
