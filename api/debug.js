const mongoose = require('mongoose');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    const results = {
        step1_env: false,
        step2_connect: false,
        step3_query: false,
        mongoUri_exists: false,
        mongoUri_preview: '',
        mongoose_version: mongoose.version,
        node_version: process.version,
        error: null
    };

    try {
        // Step 1: Check env var
        const uri = process.env.MONGODB_URI;
        results.mongoUri_exists = !!uri;
        if (uri) {
            results.mongoUri_preview = uri.substring(0, 30) + '...';
        }
        results.step1_env = true;

        if (!uri) {
            results.error = 'MONGODB_URI is not defined';
            return res.json(results);
        }

        // Step 2: Try to connect
        let conn;
        try {
            if (mongoose.connection.readyState === 1) {
                conn = mongoose;
                results.step2_connect = true;
                results.connection_state = 'already_connected';
            } else {
                conn = await mongoose.connect(uri, {
                    serverSelectionTimeoutMS: 5000,
                    connectTimeoutMS: 5000
                });
                results.step2_connect = true;
                results.connection_state = 'new_connection';
            }
        } catch (connErr) {
            results.error = 'Connection failed: ' + connErr.message;
            return res.json(results);
        }

        // Step 3: Try to query
        try {
            const db = mongoose.connection.db;
            const collections = await db.listCollections().toArray();
            results.collections = collections.map(c => c.name);

            const usersCollection = db.collection('users');
            const userCount = await usersCollection.countDocuments();
            results.userCount = userCount;

            if (userCount > 0) {
                const sampleUser = await usersCollection.findOne({}, { projection: { username: 1, role: 1, isActive: 1 } });
                results.sampleUser = sampleUser;
            }

            results.step3_query = true;
        } catch (queryErr) {
            results.error = 'Query failed: ' + queryErr.message;
            return res.json(results);
        }

        results.status = 'ALL OK';
        return res.json(results);

    } catch (err) {
        results.error = err.message;
        results.stack = err.stack;
        return res.json(results);
    }
};
