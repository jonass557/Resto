const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const User = require('../models/User');
const Category = require('../models/Category');
const Product = require('../models/Product');
const Table = require('../models/Table');
const Settings = require('../models/Settings');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connecté');

    // Clear existing data
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Product.deleteMany({}),
      Table.deleteMany({}),
      Settings.deleteMany({})
    ]);

    // Create admin
    const admin = await User.create({
      firstName: 'Admin',
      lastName: 'Restaurant',
      email: 'admin@restaurant.com',
      password: 'admin123',
      role: 'admin'
    });

    // Create agent
    const agent = await User.create({
      firstName: 'Jean',
      lastName: 'Dupont',
      email: 'agent@restaurant.com',
      password: 'agent123',
      role: 'agent'
    });

    console.log('Utilisateurs créés');

    // Create categories
    const categories = await Category.insertMany([
      { name: 'Entrées', color: '#10B981', icon: 'salad', order: 1 },
      { name: 'Plats principaux', color: '#F59E0B', icon: 'utensils', order: 2 },
      { name: 'Desserts', color: '#EC4899', icon: 'cake', order: 3 },
      { name: 'Boissons', color: '#3B82F6', icon: 'coffee', order: 4 },
      { name: 'Cocktails', color: '#8B5CF6', icon: 'wine', order: 5 },
      { name: 'Accompagnements', color: '#F97316', icon: 'leaf', order: 6 }
    ]);

    console.log('Catégories créées');

    // Create products
    await Product.insertMany([
      { name: 'Salade César', price: 3500, costPrice: 1200, category: categories[0]._id, taxRate: 0, preparationTime: 10 },
      { name: 'Soupe du jour', price: 2500, costPrice: 800, category: categories[0]._id, taxRate: 0, preparationTime: 5 },
      { name: 'Bruschetta', price: 3000, costPrice: 1000, category: categories[0]._id, taxRate: 0, preparationTime: 8 },
      { name: 'Poulet braisé', price: 5500, costPrice: 2500, category: categories[1]._id, taxRate: 0, preparationTime: 25 },
      { name: 'Poisson grillé', price: 7000, costPrice: 3500, category: categories[1]._id, taxRate: 0, preparationTime: 20 },
      { name: 'Côtes de porc', price: 6000, costPrice: 3000, category: categories[1]._id, taxRate: 0, preparationTime: 30 },
      { name: 'Steak frites', price: 8500, costPrice: 4000, category: categories[1]._id, taxRate: 0, preparationTime: 20 },
      { name: 'Spaghetti Bolognaise', price: 4500, costPrice: 1500, category: categories[1]._id, taxRate: 0, preparationTime: 15 },
      { name: 'Tiramisu', price: 3000, costPrice: 1000, category: categories[2]._id, taxRate: 0, preparationTime: 5 },
      { name: 'Crème brûlée', price: 2500, costPrice: 800, category: categories[2]._id, taxRate: 0, preparationTime: 5 },
      { name: 'Gâteau au chocolat', price: 3500, costPrice: 1200, category: categories[2]._id, taxRate: 0, preparationTime: 5 },
      { name: 'Coca-Cola', price: 1000, costPrice: 400, category: categories[3]._id, stock: 100, taxRate: 0 },
      { name: 'Fanta', price: 1000, costPrice: 400, category: categories[3]._id, stock: 100, taxRate: 0 },
      { name: 'Eau minérale', price: 500, costPrice: 200, category: categories[3]._id, stock: 200, taxRate: 0 },
      { name: 'Jus d\'orange', price: 1500, costPrice: 600, category: categories[3]._id, stock: 50, taxRate: 0 },
      { name: 'Bière locale', price: 1500, costPrice: 500, category: categories[3]._id, stock: 100, taxRate: 0 },
      { name: 'Mojito', price: 4000, costPrice: 1500, category: categories[4]._id, taxRate: 0, preparationTime: 5 },
      { name: 'Piña Colada', price: 4500, costPrice: 1800, category: categories[4]._id, taxRate: 0, preparationTime: 5 },
      { name: 'Riz blanc', price: 1000, costPrice: 300, category: categories[5]._id, taxRate: 0, preparationTime: 15 },
      { name: 'Plantain frit', price: 1500, costPrice: 500, category: categories[5]._id, taxRate: 0, preparationTime: 10 }
    ]);

    console.log('Produits créés');

    // Create tables
    const tables = [];
    for (let i = 1; i <= 15; i++) {
      tables.push({
        number: i,
        name: `Table ${i}`,
        capacity: i <= 5 ? 2 : i <= 10 ? 4 : 6,
        zone: i <= 5 ? 'Terrasse' : i <= 10 ? 'Salle principale' : 'VIP'
      });
    }
    await Table.insertMany(tables);
    console.log('Tables créées');

    // Create settings
    await Settings.create({
      restaurantName: 'Mon Restaurant',
      address: 'Rue Principale, Ville',
      phone: '+237 6XX XXX XXX',
      email: 'contact@restaurant.com',
      currency: 'XAF',
      currencySymbol: 'FCFA',
      receiptFooter: 'Merci de votre visite! À bientôt!'
    });
    console.log('Paramètres créés');

    console.log('\n=== SEED TERMINÉ ===');
    console.log('Admin: admin@restaurant.com / admin123');
    console.log('Agent: agent@restaurant.com / agent123');

    process.exit(0);
  } catch (error) {
    console.error('Erreur seed:', error);
    process.exit(1);
  }
}

seed();
