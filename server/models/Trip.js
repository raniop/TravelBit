const mongoose = require('mongoose');

const tripSchema = new mongoose.Schema({
    employeeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Employee',
        required: true
    },
    companyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    destination: {
        type: String,
        required: true,
        trim: true
    },
    departureDate: {
        type: Date,
        required: true
    },
    returnDate: {
        type: Date,
        required: true
    },
    purpose: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['planned', 'active', 'completed', 'cancelled'],
        default: 'planned'
    },
    insurancePolicyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Policy',
        default: null
    },
    cost: {
        type: Number,
        default: 0
    },
    currency: {
        type: String,
        default: 'ILS',
        enum: ['ILS', 'USD', 'EUR', 'GBP']
    },
    workdaysAbroad: {
        type: Number,
        default: 0
    },
    notes: {
        type: String,
        trim: true
    }
}, { timestamps: true });

// Virtual: trip duration in days
tripSchema.virtual('duration').get(function() {
    if (this.departureDate && this.returnDate) {
        const diff = this.returnDate - this.departureDate;
        return Math.ceil(diff / (1000 * 60 * 60 * 24));
    }
    return 0;
});

tripSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Trip', tripSchema);
