"use client";

import { VendorBills } from "@/components/finance/vendor-bills";
import { guarded } from "@/components/shared/require-module";

// Round 2 (§27): supplier / vendor bills
export default guarded("finance", VendorBills);
