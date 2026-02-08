const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    contactPerson: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    phone: {
        type: String,
        trim: true
    },
    logo: {
        type: String,
        default: null
    },
    employeeCount: {
        type: Number,
        default: 0
    },
    policyNumber: {
        type: String,
        trim: true
    },
    subscriptionStart: {
        type: Date,
        default: Date.now
    },
    subscriptionEnd: {
        type: Date
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
