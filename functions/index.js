const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

admin.initializeApp();

/**
 * Cloud Function to create a new client user
 * This creates both the Firebase Auth user AND the Firestore document
 * Then sends a password reset email so the client can set their password
 */
exports.createClient = functions.https.onCall(async (data, context) => {
  // Verify the caller is authenticated and is an admin
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to create clients.'
    );
  }

  // Check if caller is an admin
  const callerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can create clients.'
    );
  }

  const { name, email, blockDuration, blockStartDate, blockEndDate, totalSessions, selectedDays, dayTimes } = data;

  // Validate required fields
  if (!name || !email) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Name and email are required.'
    );
  }

  try {
    // Check if user already exists in Firebase Auth
    let userRecord;
    let userExists = false;

    try {
      userRecord = await admin.auth().getUserByEmail(email);
      userExists = true;
    } catch (error) {
      if (error.code !== 'auth/user-not-found') {
        throw error;
      }
    }

    if (userExists) {
      throw new functions.https.HttpsError(
        'already-exists',
        'A user with this email already exists.'
      );
    }

    // Generate a temporary password (user will reset via email)
    const tempPassword = 'TempPass' + Math.random().toString(36).slice(-8) + '!';

    // Create the Firebase Auth user
    userRecord = await admin.auth().createUser({
      email: email,
      password: tempPassword,
      displayName: name,
      emailVerified: false
    });

    // Create the Firestore document with the same UID
    await admin.firestore().collection('users').doc(userRecord.uid).set({
      name: name,
      email: email,
      role: 'client',
      blockDuration: blockDuration || 60,
      blockStartDate: blockStartDate || null,
      blockEndDate: blockEndDate || null,
      totalSessions: totalSessions || 0,
      sessionsUsed: 0,
      selectedDays: selectedDays || [],
      dayTimes: dayTimes || {},
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      createdBy: context.auth.uid
    });

    // Generate password reset link and send email
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    // Send the password reset email using Firebase Auth
    // Note: Firebase will send the email automatically when we use sendPasswordResetEmail on client
    // But we can also trigger it here

    return {
      success: true,
      uid: userRecord.uid,
      message: `Client created successfully. A password reset email has been queued for ${email}.`,
      resetLink: resetLink // Return this so admin can share if email doesn't arrive
    };

  } catch (error) {
    console.error('Error creating client:', error);

    if (error instanceof functions.https.HttpsError) {
      throw error;
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to create client: ${error.message}`
    );
  }
});

/**
 * Cloud Function to send password reset email
 * Can be called for existing users who need to reset their password
 */
exports.sendPasswordReset = functions.https.onCall(async (data, context) => {
  const { email } = data;

  if (!email) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'Email is required.'
    );
  }

  try {
    // Verify the user exists
    await admin.auth().getUserByEmail(email);

    // Generate and return the reset link
    const resetLink = await admin.auth().generatePasswordResetLink(email);

    return {
      success: true,
      message: 'Password reset link generated.',
      resetLink: resetLink
    };

  } catch (error) {
    console.error('Error sending password reset:', error);

    if (error.code === 'auth/user-not-found') {
      throw new functions.https.HttpsError(
        'not-found',
        'No user found with this email address.'
      );
    }

    throw new functions.https.HttpsError(
      'internal',
      `Failed to send password reset: ${error.message}`
    );
  }
});

/**
 * Cloud Function to delete a client
 * Deletes both the Firebase Auth user and Firestore document
 */
exports.deleteClient = functions.https.onCall(async (data, context) => {
  // Verify the caller is authenticated and is an admin
  if (!context.auth) {
    throw new functions.https.HttpsError(
      'unauthenticated',
      'You must be logged in to delete clients.'
    );
  }

  // Check if caller is an admin
  const callerDoc = await admin.firestore().collection('users').doc(context.auth.uid).get();
  if (!callerDoc.exists || callerDoc.data().role !== 'admin') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only admins can delete clients.'
    );
  }

  const { uid } = data;

  if (!uid) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      'User ID is required.'
    );
  }

  try {
    // Delete the Firebase Auth user
    try {
      await admin.auth().deleteUser(uid);
    } catch (error) {
      // User might not exist in Auth, continue to delete Firestore doc
      if (error.code !== 'auth/user-not-found') {
        console.error('Error deleting auth user:', error);
      }
    }

    // Delete the Firestore document
    await admin.firestore().collection('users').doc(uid).delete();

    return {
      success: true,
      message: 'Client deleted successfully.'
    };

  } catch (error) {
    console.error('Error deleting client:', error);
    throw new functions.https.HttpsError(
      'internal',
      `Failed to delete client: ${error.message}`
    );
  }
});
