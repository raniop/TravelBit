const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ===== USER =====
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ['admin', 'company'], required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    name: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    otpCode: { type: String, default: null },
    otpExpiresAt: { type: Date, default: null },
    otpAttempts: { type: Number, default: 0 },
    lastLogin: { type: Date, default: null },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

userSchema.pre('save', async function() {
    if (!this.isModified('password')) return;
    this.password = await bcrypt.hash(this.password, 12);
});

userSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

// ===== COMPANY =====
const companySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    slug: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    contactPerson: { type: String, required: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    logo: { type: String, default: null },
    employeeCount: { type: Number, default: 0 },
    policyNumber: { type: String, trim: true },
    agentCodes: [{ type: String, trim: true }],
    dashboardModules: { type: mongoose.Schema.Types.Mixed, default: { management: true, insurance: false, reminders: false, yeadim: false } },
    insurancePages: {
        dashboard: { type: Boolean, default: true },
        policies: { type: Boolean, default: true },
        agents: { type: Boolean, default: true },
        reports: { type: Boolean, default: true }
    },
    reminderPages: {
        agentAppointment: { type: Boolean, default: true },
        policyCancellations: { type: Boolean, default: true },
        newProductions: { type: Boolean, default: true },
        claims: { type: Boolean, default: true },
        firstDeposit: { type: Boolean, default: true },
        completingDeficiencies: { type: Boolean, default: true }
    },
    yeadimAdvanced: { type: Boolean, default: false },
    subscriptionStart: { type: Date, default: Date.now },
    subscriptionEnd: { type: Date },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });

// ===== EMPLOYEE =====
const employeeSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    idNumber: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    department: { type: String, trim: true },
    position: { type: String, trim: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
employeeSchema.virtual('fullName').get(function() { return `${this.firstName} ${this.lastName}`; });
employeeSchema.set('toJSON', { virtuals: true });

// ===== TRIP =====
const tripSchema = new mongoose.Schema({
    employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    destination: { type: String, required: true, trim: true },
    departureDate: { type: Date, required: true },
    returnDate: { type: Date, required: true },
    purpose: { type: String, trim: true },
    status: { type: String, enum: ['planned', 'active', 'completed', 'cancelled'], default: 'planned' },
    insurancePolicyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy', default: null },
    cost: { type: Number, default: 0 },
    currency: { type: String, default: 'ILS', enum: ['ILS', 'USD', 'EUR', 'GBP'] },
    workdaysAbroad: { type: Number, default: 0 },
    notes: { type: String, trim: true }
}, { timestamps: true });
tripSchema.virtual('duration').get(function() {
    if (this.departureDate && this.returnDate) {
        return Math.ceil((this.returnDate - this.departureDate) / (1000 * 60 * 60 * 24));
    }
    return 0;
});
tripSchema.set('toJSON', { virtuals: true });

// ===== POLICY =====
const policySchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    policyNumber: { type: String, required: true, trim: true },
    type: { type: String, required: true, trim: true },
    startDate: { type: Date, required: true },
    expirationDate: { type: Date, required: true },
    coverageDetails: { type: String, trim: true },
    premium: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'expiring', 'expired'], default: 'active' },
    renewalAlertSent: { type: Boolean, default: false }
}, { timestamps: true });
policySchema.virtual('daysUntilExpiration').get(function() {
    if (this.expirationDate) return Math.ceil((this.expirationDate - new Date()) / (1000 * 60 * 60 * 24));
    return 0;
});
policySchema.set('toJSON', { virtuals: true });

// ===== REMINDER =====
const reminderSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    type: {
        type: String,
        enum: ['agentAppointment', 'policyCancellations', 'newProductions',
               'claims', 'firstDeposit', 'completingDeficiencies'],
        required: true
    },
    agentCode: { type: String, trim: true },
    customerName: { type: String, trim: true },
    idNumber: { type: String, trim: true },
    phone: { type: String, trim: true },
    policyNumber: { type: String, trim: true },
    insuranceCompany: { type: String, trim: true },
    date: { type: Date },
    amount: { type: Number, default: 0 },
    status: { type: String, enum: ['open', 'inProgress', 'completed', 'cancelled'], default: 'open' },
    notes: { type: String, trim: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

// ===== DASHBOARD CACHE =====
const dashboardCacheSchema = new mongoose.Schema({
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    cacheKey: { type: String, required: true }, // e.g. "dashboard:2:2026" or "agents-report"
    data: { type: mongoose.Schema.Types.Mixed, required: true },
    cachedAt: { type: Date, default: Date.now }
}, { timestamps: false });
dashboardCacheSchema.index({ companyId: 1, cacheKey: 1 }, { unique: true });
dashboardCacheSchema.index({ cachedAt: 1 }, { expireAfterSeconds: 86400 }); // auto-delete after 24h

// Generate URL-safe slug from company name (supports Hebrew)
function generateSlug(name) {
    if (!name) return '';
    return name
        .trim()
        .toLowerCase()
        .replace(/['"״׳]/g, '')           // remove quotes
        .replace(/[\s\-_]+/g, '-')         // spaces/dashes/underscores → single dash
        .replace(/[^a-z0-9\u0590-\u05FF\-]/g, '') // keep only alphanumeric, Hebrew, dashes
        .replace(/^-+|-+$/g, '');          // trim leading/trailing dashes
}

// Normalize dashboardModules: supports both old string format and new object format
function normalizeDashboardModules(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return {
            management: raw.management !== false,
            insurance: raw.insurance === true,
            reminders: raw.reminders === true,
            yeadim: raw.yeadim === true
        };
    }
    if (raw === 'insurance') return { management: false, insurance: true, reminders: false, yeadim: false };
    if (raw === 'both') return { management: true, insurance: true, reminders: false, yeadim: false };
    return { management: true, insurance: false, reminders: false, yeadim: false };
}

// Use existing models if already compiled (serverless caching)
const User = mongoose.models.User || mongoose.model('User', userSchema);
const Company = mongoose.models.Company || mongoose.model('Company', companySchema);
const Employee = mongoose.models.Employee || mongoose.model('Employee', employeeSchema);
const Trip = mongoose.models.Trip || mongoose.model('Trip', tripSchema);
const Policy = mongoose.models.Policy || mongoose.model('Policy', policySchema);
const Reminder = mongoose.models.Reminder || mongoose.model('Reminder', reminderSchema);
const DashboardCache = mongoose.models.DashboardCache || mongoose.model('DashboardCache', dashboardCacheSchema);

module.exports = { User, Company, Employee, Trip, Policy, Reminder, DashboardCache, normalizeDashboardModules, generateSlug };
