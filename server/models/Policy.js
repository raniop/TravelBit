const mongoose = require('mongoose');

const policySchema = new mongoose.Schema({
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    policyNumber: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        required: true,
        trim: true
    },
    startDate: {
        type: Date,
        required: true
    },
    expirationDate: {
        type: Date,
        required: true
    },
    coverageDetails: {
        type: String,
        trim: true
    },
    premium: {
        type: Number,
        default: 0
    },
    status: {
        type: String,
        enum: ['active', 'expiring', 'expired'],
        default: 'active'
    },
    renewalAlertSent: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

// Virtual: days until expiration
policySchema.virtual('daysUntilExpiration').get(function() {
    if (this.expirationDate) {
        const diff = this.expirationDate - new Date();
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return 0;
});

policySchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Policy', policySchema);
