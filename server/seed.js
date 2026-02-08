require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
const Employee = require('./models/Employee');
const Trip = require('./models/Trip');
const Policy = require('./models/Policy');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/travelins';

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clear existing data
        await Promise.all([
            User.deleteMany({}),
            Company.deleteMany({}),
            Employee.deleteMany({}),
            Trip.deleteMany({}),
            Policy.deleteMany({})
        ]);
        console.log('Cleared existing data');

        // Create admin user
        const admin = await User.create({
            username: 'admin',
            password: 'admin123',
            role: 'admin',
            name: 'מנהל מערכת',
            email: 'admin@travelins.co.il'
        });
        console.log('Admin created: admin / admin123');

        // Create sample companies
        const company1 = await Company.create({
            name: 'טכנולוגיות אופיר בע"מ',
            contactPerson: 'רני כהן',
            email: 'rani@ophir-tech.co.il',
            phone: '03-5551234',
            policyNumber: 'POL-2026-001',
            subscriptionEnd: new Date('2027-01-01')
        });

        const company2 = await Company.create({
            name: 'סטארטאפ גלובל בע"מ',
            contactPerson: 'דניאל לוי',
            email: 'daniel@startup-global.co.il',
            phone: '03-5559876',
            policyNumber: 'POL-2026-002',
            subscriptionEnd: new Date('2026-12-01')
        });

        // Create company users
        await User.create({
            username: 'ophir',
            password: 'ophir123',
            role: 'company',
            companyId: company1._id,
            name: 'רני כהן',
            email: 'rani@ophir-tech.co.il'
        });
        console.log('Company 1 user: ophir / ophir123');

        await User.create({
            username: 'startup',
            password: 'startup123',
            role: 'company',
            companyId: company2._id,
            name: 'דניאל לוי',
            email: 'daniel@startup-global.co.il'
        });
        console.log('Company 2 user: startup / startup123');

        // Create employees for Company 1
        const employees1 = await Employee.insertMany([
            { companyId: company1._id, firstName: 'יוסי', lastName: 'אברהמי', department: 'פיתוח', position: 'מפתח בכיר', email: 'yossi@ophir.co.il' },
            { companyId: company1._id, firstName: 'שרה', lastName: 'ישראלי', department: 'מכירות', position: 'מנהלת מכירות', email: 'sara@ophir.co.il' },
            { companyId: company1._id, firstName: 'דוד', lastName: 'כהן', department: 'פיתוח', position: 'ארכיטקט', email: 'david@ophir.co.il' },
            { companyId: company1._id, firstName: 'מיכל', lastName: 'ברון', department: 'שיווק', position: 'מנהלת שיווק', email: 'michal@ophir.co.il' },
            { companyId: company1._id, firstName: 'אלון', lastName: 'גולן', department: 'הנהלה', position: 'סמנכ"ל', email: 'alon@ophir.co.il' }
        ]);
        console.log(`Created ${employees1.length} employees for Company 1`);

        // Create employees for Company 2
        const employees2 = await Employee.insertMany([
            { companyId: company2._id, firstName: 'נועה', lastName: 'שפירא', department: 'מוצר', position: 'מנהלת מוצר', email: 'noa@startup.co.il' },
            { companyId: company2._id, firstName: 'עמית', lastName: 'רז', department: 'פיתוח', position: 'CTO', email: 'amit@startup.co.il' },
            { companyId: company2._id, firstName: 'תמר', lastName: 'לנדאו', department: 'עסקים', position: 'BD Manager', email: 'tamar@startup.co.il' }
        ]);
        console.log(`Created ${employees2.length} employees for Company 2`);

        // Create trips for Company 1
        const destinations = ['ניו יורק', 'לונדון', 'ברלין', 'פריז', 'אמסטרדם', 'סן פרנסיסקו', 'טוקיו', 'סינגפור', 'דובאי', 'ציריך'];
        const purposes = ['כנס טכנולוגי', 'פגישת לקוח', 'הדרכה', 'תערוכה', 'שיתוף פעולה', 'הקמת משרד'];

        const trips = [];
        const now = new Date();

        // Generate 30 trips for company 1 over the last 6 months
        for (let i = 0; i < 30; i++) {
            const emp = employees1[Math.floor(Math.random() * employees1.length)];
            const daysAgo = Math.floor(Math.random() * 180);
            const departure = new Date(now);
            departure.setDate(departure.getDate() - daysAgo);
            const duration = Math.floor(Math.random() * 10) + 2;
            const returnDate = new Date(departure);
            returnDate.setDate(returnDate.getDate() + duration);
            const workdays = Math.max(1, duration - 2);

            let status = 'completed';
            if (daysAgo < 5 && returnDate > now) status = 'active';
            else if (daysAgo < 0) status = 'planned';

            trips.push({
                employeeId: emp._id,
                companyId: company1._id,
                destination: destinations[Math.floor(Math.random() * destinations.length)],
                departureDate: departure,
                returnDate: returnDate,
                purpose: purposes[Math.floor(Math.random() * purposes.length)],
                status,
                cost: Math.floor(Math.random() * 15000) + 3000,
                currency: 'ILS',
                workdaysAbroad: workdays
            });
        }

        // Generate 15 trips for company 2
        for (let i = 0; i < 15; i++) {
            const emp = employees2[Math.floor(Math.random() * employees2.length)];
            const daysAgo = Math.floor(Math.random() * 180);
            const departure = new Date(now);
            departure.setDate(departure.getDate() - daysAgo);
            const duration = Math.floor(Math.random() * 7) + 2;
            const returnDate = new Date(departure);
            returnDate.setDate(returnDate.getDate() + duration);

            trips.push({
                employeeId: emp._id,
                companyId: company2._id,
                destination: destinations[Math.floor(Math.random() * destinations.length)],
                departureDate: departure,
                returnDate: returnDate,
                purpose: purposes[Math.floor(Math.random() * purposes.length)],
                status: 'completed',
                cost: Math.floor(Math.random() * 12000) + 2000,
                currency: 'ILS',
                workdaysAbroad: Math.max(1, duration - 1)
            });
        }

        await Trip.insertMany(trips);
        console.log(`Created ${trips.length} trips total`);

        // Create policies
        await Policy.insertMany([
            {
                companyId: company1._id,
                policyNumber: 'POL-2026-001',
                type: 'ביטוח נסיעות עסקי שנתי',
                startDate: new Date('2026-01-01'),
                expirationDate: new Date('2027-01-01'),
                coverageDetails: 'ביטוח מקיף לנסיעות עסקים כולל ביטול טיסה',
                premium: 45000,
                status: 'active'
            },
            {
                companyId: company1._id,
                policyNumber: 'POL-2026-001B',
                type: 'ביטוח חיים קבוצתי',
                startDate: new Date('2025-06-01'),
                expirationDate: new Date('2026-03-01'),
                coverageDetails: 'ביטוח חיים ואובדן כושר עבודה',
                premium: 30000,
                status: 'expiring'
            },
            {
                companyId: company1._id,
                policyNumber: 'POL-2025-OLD',
                type: 'ביטוח נסיעות חד פעמי',
                startDate: new Date('2025-01-01'),
                expirationDate: new Date('2025-12-31'),
                coverageDetails: 'ביטוח נסיעות בסיסי',
                premium: 8000,
                status: 'expired'
            },
            {
                companyId: company2._id,
                policyNumber: 'POL-2026-002',
                type: 'ביטוח נסיעות עסקי',
                startDate: new Date('2026-01-01'),
                expirationDate: new Date('2026-12-01'),
                coverageDetails: 'ביטוח נסיעות עסקי מורחב',
                premium: 25000,
                status: 'active'
            },
            {
                companyId: company2._id,
                policyNumber: 'POL-2026-002B',
                type: 'ביטוח אחריות מקצועית',
                startDate: new Date('2025-03-01'),
                expirationDate: new Date('2026-02-15'),
                coverageDetails: 'ביטוח אחריות מקצועית לעובדים בחו"ל',
                premium: 15000,
                status: 'expiring'
            }
        ]);
        console.log('Created 5 insurance policies');

        console.log('\n====================================');
        console.log('  Seed completed successfully!');
        console.log('====================================');
        console.log('\nLogin credentials:');
        console.log('  Admin:     admin / admin123');
        console.log('  Company 1: ophir / ophir123  (טכנולוגיות אופיר)');
        console.log('  Company 2: startup / startup123  (סטארטאפ גלובל)');
        console.log('\nURLs:');
        console.log('  Marketing site:    http://localhost:3000');
        console.log('  Admin panel:       http://localhost:3000/admin/login.html');
        console.log('  Company dashboard: http://localhost:3000/dashboard/login.html');
        console.log('====================================\n');

        process.exit(0);
    } catch (error) {
        console.error('Seed error:', error);
        process.exit(1);
    }
}

seed();
