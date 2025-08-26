import { useState, useEffect } from "react";

export function useOnboardingStatus() {
  const [isOnboardingDone, setIsOnboardingDone] = useState(true);

  useEffect(() => {
    const done = localStorage.getItem('onboarding_done_v1') === 'true';
    setIsOnboardingDone(done);
  }, []);

  return isOnboardingDone;
}
