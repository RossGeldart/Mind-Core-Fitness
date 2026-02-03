// Authentication Helper Functions for Mind Core Fitness
// =====================================================

const MCFAuth = {
    // Current user state
    currentUser: null,
    userRole: null, // 'admin' or 'client'

    // Initialize auth state listener
    init: function(onAuthStateChanged) {
        MCF.auth.onAuthStateChanged(async (user) => {
            this.currentUser = user;
            if (user) {
                // Get user role from Firestore
                const userDoc = await MCF.db.collection('users').doc(user.uid).get();
                if (userDoc.exists) {
                    this.userRole = userDoc.data().role;
                }
            } else {
                this.userRole = null;
            }
            if (onAuthStateChanged) {
                onAuthStateChanged(user, this.userRole);
            }
        });
    },

    // Sign in with email and password
    signIn: async function(email, password) {
        try {
            const result = await MCF.auth.signInWithEmailAndPassword(email, password);
            return { success: true, user: result.user };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: this.getErrorMessage(error.code) };
        }
    },

    // Sign out
    signOut: async function() {
        try {
            await MCF.auth.signOut();
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    },

    // Send password reset email
    resetPassword: async function(email) {
        try {
            await MCF.auth.sendPasswordResetEmail(email);
            return { success: true };
        } catch (error) {
            console.error('Password reset error:', error);
            return { success: false, error: this.getErrorMessage(error.code) };
        }
    },

    // Check if current user is admin
    isAdmin: function() {
        return this.userRole === 'admin';
    },

    // Check if current user is client
    isClient: function() {
        return this.userRole === 'client';
    },

    // Require authentication - redirect if not logged in
    requireAuth: function(redirectUrl = '/admin/login.html') {
        if (!this.currentUser) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    },

    // Require admin role
    requireAdmin: function(redirectUrl = '/admin/login.html') {
        if (!this.currentUser || !this.isAdmin()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    },

    // Require client role
    requireClient: function(redirectUrl = '/dashboard/login.html') {
        if (!this.currentUser || !this.isClient()) {
            window.location.href = redirectUrl;
            return false;
        }
        return true;
    },

    // Get friendly error message
    getErrorMessage: function(errorCode) {
        const messages = {
            'auth/invalid-email': 'Invalid email address',
            'auth/user-disabled': 'This account has been disabled',
            'auth/user-not-found': 'No account found with this email',
            'auth/wrong-password': 'Incorrect password',
            'auth/email-already-in-use': 'This email is already registered',
            'auth/weak-password': 'Password should be at least 6 characters',
            'auth/too-many-requests': 'Too many attempts. Please try again later',
            'auth/invalid-credential': 'Invalid email or password'
        };
        return messages[errorCode] || 'An error occurred. Please try again.';
    }
};

// Export
window.MCFAuth = MCFAuth;
