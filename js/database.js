// Database Helper Functions for Mind Core Fitness
// ================================================
// Firestore Data Model:
//
// users/{uid}
//   - email: string
//   - name: string
//   - role: 'admin' | 'client'
//   - createdAt: timestamp
//   - (for clients):
//     - blockDuration: number (minutes: 30, 45, 60)
//     - blockEndDate: timestamp (when their current block ends)
//     - allowedSlots: array of { day: 0-6, startTime: "09:00", endTime: "17:00" }
//
// availability/{docId}
//   - day: number (0=Sunday, 1=Monday, ... 6=Saturday)
//   - startTime: string ("09:00")
//   - endTime: string ("17:00")
//   - recurring: boolean
//   - specificDate: timestamp (if not recurring)
//
// bookings/{docId}
//   - clientId: string (uid)
//   - clientName: string
//   - date: timestamp
//   - startTime: string ("10:00")
//   - endTime: string ("11:00")
//   - status: 'confirmed' | 'cancelled' | 'completed'
//   - createdAt: timestamp
//   - notes: string

const MCFDatabase = {
    // ==================
    // USER MANAGEMENT
    // ==================

    // Create a new client user (admin only)
    createClient: async function(email, name, blockDuration, blockEndDate, allowedSlots) {
        try {
            // Note: Creating auth user requires Firebase Admin SDK (backend)
            // For now, we'll create the Firestore document
            // The auth user should be created via Firebase Console or a Cloud Function

            const clientData = {
                email: email,
                name: name,
                role: 'client',
                blockDuration: blockDuration || 60,
                blockEndDate: blockEndDate ? firebase.firestore.Timestamp.fromDate(new Date(blockEndDate)) : null,
                allowedSlots: allowedSlots || [],
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            // Use email as a temporary ID until they sign up
            const docRef = await MCF.db.collection('users').add(clientData);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Create client error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get all clients
    getClients: async function() {
        try {
            const snapshot = await MCF.db.collection('users')
                .where('role', '==', 'client')
                .orderBy('name')
                .get();

            const clients = [];
            snapshot.forEach(doc => {
                clients.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, clients: clients };
        } catch (error) {
            console.error('Get clients error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get single client
    getClient: async function(clientId) {
        try {
            const doc = await MCF.db.collection('users').doc(clientId).get();
            if (doc.exists) {
                return { success: true, client: { id: doc.id, ...doc.data() } };
            }
            return { success: false, error: 'Client not found' };
        } catch (error) {
            console.error('Get client error:', error);
            return { success: false, error: error.message };
        }
    },

    // Update client
    updateClient: async function(clientId, updates) {
        try {
            await MCF.db.collection('users').doc(clientId).update(updates);
            return { success: true };
        } catch (error) {
            console.error('Update client error:', error);
            return { success: false, error: error.message };
        }
    },

    // Delete client (and their bookings)
    deleteClient: async function(clientId) {
        try {
            // Delete future bookings
            const bookings = await MCF.db.collection('bookings')
                .where('clientId', '==', clientId)
                .where('date', '>=', new Date())
                .get();

            const batch = MCF.db.batch();
            bookings.forEach(doc => batch.delete(doc.ref));

            // Delete user document
            batch.delete(MCF.db.collection('users').doc(clientId));

            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Delete client error:', error);
            return { success: false, error: error.message };
        }
    },

    // ==================
    // AVAILABILITY
    // ==================

    // Set recurring weekly availability
    setAvailability: async function(day, startTime, endTime) {
        try {
            // Check if slot already exists
            const existing = await MCF.db.collection('availability')
                .where('day', '==', day)
                .where('recurring', '==', true)
                .get();

            if (!existing.empty) {
                // Update existing
                await existing.docs[0].ref.update({ startTime, endTime });
            } else {
                // Create new
                await MCF.db.collection('availability').add({
                    day: day,
                    startTime: startTime,
                    endTime: endTime,
                    recurring: true
                });
            }
            return { success: true };
        } catch (error) {
            console.error('Set availability error:', error);
            return { success: false, error: error.message };
        }
    },

    // Remove availability for a day
    removeAvailability: async function(day) {
        try {
            const snapshot = await MCF.db.collection('availability')
                .where('day', '==', day)
                .where('recurring', '==', true)
                .get();

            const batch = MCF.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return { success: true };
        } catch (error) {
            console.error('Remove availability error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get all availability
    getAvailability: async function() {
        try {
            const snapshot = await MCF.db.collection('availability').get();
            const availability = [];
            snapshot.forEach(doc => {
                availability.push({ id: doc.id, ...doc.data() });
            });
            return { success: true, availability: availability };
        } catch (error) {
            console.error('Get availability error:', error);
            return { success: false, error: error.message };
        }
    },

    // Block specific date/time (one-off unavailability)
    blockTime: async function(date, startTime, endTime, reason) {
        try {
            await MCF.db.collection('blockedTimes').add({
                date: firebase.firestore.Timestamp.fromDate(new Date(date)),
                startTime: startTime,
                endTime: endTime,
                reason: reason || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            return { success: true };
        } catch (error) {
            console.error('Block time error:', error);
            return { success: false, error: error.message };
        }
    },

    // ==================
    // BOOKINGS
    // ==================

    // Create a booking
    createBooking: async function(clientId, clientName, date, startTime, endTime, notes) {
        try {
            const booking = {
                clientId: clientId,
                clientName: clientName,
                date: firebase.firestore.Timestamp.fromDate(new Date(date)),
                startTime: startTime,
                endTime: endTime,
                status: 'confirmed',
                notes: notes || '',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await MCF.db.collection('bookings').add(booking);
            return { success: true, id: docRef.id };
        } catch (error) {
            console.error('Create booking error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get bookings for a date range
    getBookings: async function(startDate, endDate) {
        try {
            const snapshot = await MCF.db.collection('bookings')
                .where('date', '>=', firebase.firestore.Timestamp.fromDate(new Date(startDate)))
                .where('date', '<=', firebase.firestore.Timestamp.fromDate(new Date(endDate)))
                .orderBy('date')
                .get();

            const bookings = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                bookings.push({
                    id: doc.id,
                    ...data,
                    date: data.date.toDate()
                });
            });
            return { success: true, bookings: bookings };
        } catch (error) {
            console.error('Get bookings error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get bookings for a specific client
    getClientBookings: async function(clientId) {
        try {
            const snapshot = await MCF.db.collection('bookings')
                .where('clientId', '==', clientId)
                .where('date', '>=', new Date())
                .orderBy('date')
                .get();

            const bookings = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                bookings.push({
                    id: doc.id,
                    ...data,
                    date: data.date.toDate()
                });
            });
            return { success: true, bookings: bookings };
        } catch (error) {
            console.error('Get client bookings error:', error);
            return { success: false, error: error.message };
        }
    },

    // Update booking
    updateBooking: async function(bookingId, updates) {
        try {
            if (updates.date) {
                updates.date = firebase.firestore.Timestamp.fromDate(new Date(updates.date));
            }
            await MCF.db.collection('bookings').doc(bookingId).update(updates);
            return { success: true };
        } catch (error) {
            console.error('Update booking error:', error);
            return { success: false, error: error.message };
        }
    },

    // Cancel booking
    cancelBooking: async function(bookingId) {
        return this.updateBooking(bookingId, { status: 'cancelled' });
    },

    // Delete old bookings (cleanup - call periodically)
    cleanupOldBookings: async function(daysOld = 30) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - daysOld);

            const snapshot = await MCF.db.collection('bookings')
                .where('date', '<', firebase.firestore.Timestamp.fromDate(cutoffDate))
                .get();

            const batch = MCF.db.batch();
            snapshot.forEach(doc => batch.delete(doc.ref));
            await batch.commit();

            return { success: true, deleted: snapshot.size };
        } catch (error) {
            console.error('Cleanup error:', error);
            return { success: false, error: error.message };
        }
    },

    // ==================
    // REAL-TIME LISTENERS
    // ==================

    // Listen to bookings (real-time updates)
    subscribeToBookings: function(startDate, endDate, callback) {
        return MCF.db.collection('bookings')
            .where('date', '>=', firebase.firestore.Timestamp.fromDate(new Date(startDate)))
            .where('date', '<=', firebase.firestore.Timestamp.fromDate(new Date(endDate)))
            .orderBy('date')
            .onSnapshot(snapshot => {
                const bookings = [];
                snapshot.forEach(doc => {
                    const data = doc.data();
                    bookings.push({
                        id: doc.id,
                        ...data,
                        date: data.date.toDate()
                    });
                });
                callback(bookings);
            });
    },

    // Listen to availability changes
    subscribeToAvailability: function(callback) {
        return MCF.db.collection('availability')
            .onSnapshot(snapshot => {
                const availability = [];
                snapshot.forEach(doc => {
                    availability.push({ id: doc.id, ...doc.data() });
                });
                callback(availability);
            });
    },

    // ==================
    // UTILITY FUNCTIONS
    // ==================

    // Check if a time slot is available
    isSlotAvailable: async function(date, startTime, endTime) {
        try {
            const dayOfWeek = new Date(date).getDay();

            // Check admin availability for this day
            const availResult = await this.getAvailability();
            if (!availResult.success) return false;

            const dayAvail = availResult.availability.find(a => a.day === dayOfWeek && a.recurring);
            if (!dayAvail) return false; // Admin not available this day

            // Check if requested time is within available hours
            if (startTime < dayAvail.startTime || endTime > dayAvail.endTime) {
                return false;
            }

            // Check for conflicting bookings
            const bookingsResult = await this.getBookings(date, date);
            if (!bookingsResult.success) return false;

            const hasConflict = bookingsResult.bookings.some(booking => {
                if (booking.status === 'cancelled') return false;
                return (startTime < booking.endTime && endTime > booking.startTime);
            });

            return !hasConflict;
        } catch (error) {
            console.error('Check availability error:', error);
            return false;
        }
    },

    // Get available slots for a date (for client calendar)
    getAvailableSlots: async function(date, blockDuration) {
        try {
            const dayOfWeek = new Date(date).getDay();

            // Get admin availability
            const availResult = await this.getAvailability();
            if (!availResult.success) return [];

            const dayAvail = availResult.availability.find(a => a.day === dayOfWeek && a.recurring);
            if (!dayAvail) return []; // Not available this day

            // Get existing bookings
            const bookingsResult = await this.getBookings(date, date);
            const bookedTimes = bookingsResult.success ?
                bookingsResult.bookings.filter(b => b.status !== 'cancelled') : [];

            // Generate time slots
            const slots = [];
            const duration = blockDuration || 60;
            let currentTime = this.timeToMinutes(dayAvail.startTime);
            const endTime = this.timeToMinutes(dayAvail.endTime);

            while (currentTime + duration <= endTime) {
                const slotStart = this.minutesToTime(currentTime);
                const slotEnd = this.minutesToTime(currentTime + duration);

                // Check if this slot conflicts with any booking
                const isBooked = bookedTimes.some(booking => {
                    const bookingStart = this.timeToMinutes(booking.startTime);
                    const bookingEnd = this.timeToMinutes(booking.endTime);
                    return (currentTime < bookingEnd && currentTime + duration > bookingStart);
                });

                slots.push({
                    startTime: slotStart,
                    endTime: slotEnd,
                    available: !isBooked
                });

                currentTime += duration;
            }

            return slots;
        } catch (error) {
            console.error('Get available slots error:', error);
            return [];
        }
    },

    // Helper: Convert time string to minutes
    timeToMinutes: function(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    },

    // Helper: Convert minutes to time string
    minutesToTime: function(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    }
};

// Export
window.MCFDatabase = MCFDatabase;
