import {
  useSignInWithEmail,
  useVerifyEmailOTP,
  useIsSignedIn,
} from "@coinbase/cdp-hooks";
import { useState } from "react";

export function AuthComponent() {
  const { signInWithEmail } = useSignInWithEmail();
  const { verifyEmailOTP } = useVerifyEmailOTP();
  const { isSignedIn } = useIsSignedIn();
  const [flowId, setFlowId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");

  const handleEmailSubmit = async () => {
    if (!email) return;
    try {
      const result = await signInWithEmail({ email });
      setFlowId(result.flowId);
    } catch (error) {
      console.error("Sign in failed:", error);
    }
  };

  const handleOtpSubmit = async () => {
    if (!flowId || !otp) return;
    try {
      const { user } = await verifyEmailOTP({ flowId, otp });
      console.log("Signed in!", user.evmAccounts?.[0]);
    } catch (error) {
      console.error("OTP verification failed:", error);
    }
  };

  if (isSignedIn) {
    return <div>Welcome! You're signed in.</div>;
  }

  return (
    <div>
      {flowId ? (
        <div>
          <h2>Enter OTP</h2>
          <input
            type="text"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="Enter OTP code"
          />
          <button onClick={handleOtpSubmit}>Verify OTP</button>
        </div>
      ) : (
        <div>
          <h2>Sign in with Email</h2>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email"
          />
          <button onClick={handleEmailSubmit}>Send OTP</button>
        </div>
      )}
    </div>
  );
}
