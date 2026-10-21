"use client";

import { SafetySiteView } from "@/components/safety/site-view";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): permits / TBT, PPE expiry and crews for Safety
export default guarded("safety", SafetySiteView);
