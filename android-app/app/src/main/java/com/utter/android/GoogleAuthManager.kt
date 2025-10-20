package com.utter.android

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.android.gms.tasks.Task
import kotlinx.coroutines.tasks.await

class GoogleAuthManager(private val context: Context, private val clientId: String) {

    companion object {
        private const val TAG = "GoogleAuthManager"
        const val RC_SIGN_IN = 9001
        private const val PREFS_NAME = "UtterAuthPrefs"
        private const val PREF_ID_TOKEN = "id_token"
    }

    private val googleSignInClient: GoogleSignInClient

    init {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(clientId)
            .requestEmail()
            .build()

        googleSignInClient = GoogleSignIn.getClient(context, gso)
    }

    /**
     * Get current signed-in account
     */
    fun getSignedInAccount(): GoogleSignInAccount? {
        return GoogleSignIn.getLastSignedInAccount(context)
    }

    /**
     * Get ID token from signed-in account (always gets fresh token)
     * Note: This returns the cached account's token, which may be stale.
     * Use getIdTokenAsync() for a fresh token.
     */
    fun getIdToken(): String? {
        // Try to get token from current account
        val account = getSignedInAccount()
        return account?.idToken
    }

    /**
     * Get a fresh ID token by performing silent sign-in
     * This should be called from a coroutine/background thread
     */
    suspend fun getIdTokenAsync(): String? {
        return try {
            // Use silentSignIn to get a fresh token
            val account = googleSignInClient.silentSignIn().await()
            val token = account?.idToken
            if (token != null) {
                Log.d(TAG, "Fresh ID token obtained via silent sign-in")
                saveIdToken(token)
            }
            token
        } catch (e: Exception) {
            Log.e(TAG, "Silent sign-in failed: ${e.message}", e)
            // Fall back to last known account
            getSignedInAccount()?.idToken
        }
    }

    /**
     * Check if user is signed in
     */
    fun isSignedIn(): Boolean {
        return getSignedInAccount() != null
    }

    /**
     * Get sign-in intent
     */
    fun getSignInIntent(): Intent {
        return googleSignInClient.signInIntent
    }

    /**
     * Handle sign-in result from intent
     */
    fun handleSignInResult(data: Intent?): Task<GoogleSignInAccount> {
        return GoogleSignIn.getSignedInAccountFromIntent(data)
    }

    /**
     * Process sign-in task result
     */
    fun processSignInTask(task: Task<GoogleSignInAccount>,
                         onSuccess: (String) -> Unit,
                         onFailure: (String) -> Unit) {
        try {
            val account = task.getResult(ApiException::class.java)
            val idToken = account?.idToken

            if (idToken != null) {
                saveIdToken(idToken)
                Log.d(TAG, "Sign-in successful, email: ${account.email}")
                onSuccess(idToken)
            } else {
                Log.e(TAG, "ID token is null")
                onFailure("Failed to get ID token")
            }
        } catch (e: ApiException) {
            Log.e(TAG, "Sign-in failed: ${e.statusCode}", e)
            onFailure("Sign-in failed: ${e.message}")
        }
    }

    /**
     * Sign out
     */
    fun signOut(onComplete: () -> Unit = {}) {
        googleSignInClient.signOut().addOnCompleteListener {
            clearCachedIdToken()
            Log.d(TAG, "Signed out")
            onComplete()
        }
    }

    /**
     * Revoke access
     */
    fun revokeAccess(onComplete: () -> Unit = {}) {
        googleSignInClient.revokeAccess().addOnCompleteListener {
            clearCachedIdToken()
            Log.d(TAG, "Access revoked")
            onComplete()
        }
    }

    /**
     * Save ID token to SharedPreferences
     */
    private fun saveIdToken(token: String) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(PREF_ID_TOKEN, token).apply()
    }

    /**
     * Get cached ID token from SharedPreferences
     */
    private fun getCachedIdToken(): String? {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        return prefs.getString(PREF_ID_TOKEN, null)
    }

    /**
     * Clear cached ID token
     */
    private fun clearCachedIdToken() {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().remove(PREF_ID_TOKEN).apply()
    }
}
