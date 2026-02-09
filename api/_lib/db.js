const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global._mongooseCache;
if (!cached) {
    cached = global._mongooseCache = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) {
        // Verify connection is still alive
        if (mongoose.connection.readyState === 1) {
            return cached.conn;
        }
        // Connection dropped, reset cache
        cached.conn = null;
        cached.promise = null;
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGODB_URI, {
            bufferCommands: false,
            maxPoolSize: 1,
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
        }).then((m) => m);
    }

    try {
        cached.conn = await cached.promise;
        return cached.conn;
    } catch (error) {
        // Reset cache so next call retries
        cached.promise = null;
        cached.conn = null;
        throw error;
    }
}

module.exports = connectDB;
