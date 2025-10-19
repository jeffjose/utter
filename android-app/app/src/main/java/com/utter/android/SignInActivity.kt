package com.utter.android

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Button
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity

class SignInActivity : AppCompatActivity() {

    companion object {
        private const val TAG = "SignInActivity"
    }

    private lateinit var authManager: GoogleAuthManager
    private lateinit var signInButton: Button
    private lateinit var progressBar: ProgressBar
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_sign_in)

        // Initialize views
        signInButton = findViewById(R.id.signInButton)
        progressBar = findViewById(R.id.progressBar)
        statusText = findViewById(R.id.statusText)

        // Initialize auth manager
        authManager = GoogleAuthManager(this, BuildConfig.GOOGLE_CLIENT_ID)

        // Check if already signed in
        if (authManager.isSignedIn()) {
            Log.d(TAG, "Already signed in, proceeding to server selection")
            proceedToServerSelection()
            return
        }

        // Set up sign-in button
        signInButton.setOnClickListener {
            signIn()
        }
    }

    private fun signIn() {
        Log.d(TAG, "Starting sign-in flow")
        setLoading(true)

        val signInIntent = authManager.getSignInIntent()
        startActivityForResult(signInIntent, GoogleAuthManager.RC_SIGN_IN)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == GoogleAuthManager.RC_SIGN_IN) {
            val task = authManager.handleSignInResult(data)

            authManager.processSignInTask(
                task,
                onSuccess = { idToken ->
                    Log.d(TAG, "Sign-in successful")
                    Toast.makeText(this, "Signed in successfully", Toast.LENGTH_SHORT).show()
                    proceedToServerSelection()
                },
                onFailure = { error ->
                    Log.e(TAG, "Sign-in failed: $error")
                    Toast.makeText(this, "Sign-in failed: $error", Toast.LENGTH_LONG).show()
                    setLoading(false)
                }
            )
        }
    }

    private fun proceedToServerSelection() {
        // Navigate to ServerSelectionActivity (or directly to MainActivity if server is configured)
        // For now, we'll go directly to MainActivity
        val intent = Intent(this, MainActivity::class.java)
        startActivity(intent)
        finish()
    }

    private fun setLoading(loading: Boolean) {
        runOnUiThread {
            if (loading) {
                signInButton.visibility = View.GONE
                progressBar.visibility = View.VISIBLE
                statusText.text = "Signing in..."
            } else {
                signInButton.visibility = View.VISIBLE
                progressBar.visibility = View.GONE
                statusText.text = ""
            }
        }
    }
}
