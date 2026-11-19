/** Who operates Kosmik (a product of Asanoha) and how to reach them. Shown on the legal pages. */
export const OPERATOR = {
  name: "Asanoha LLP",
  llpin: "ADE-0939",
  /** Support: account deletion and general questions. */
  email: "orders@asanoha.co.in",
  /** Support on WhatsApp (help menu, Help, Premium). Not part of the legal or grievance details. */
  phone: "+91 98934 53114",
  grievanceEmail: "orders@asanoha.co.in",
  address: "Unit 101, Oxford Towers, 139/88 HAL Old Airport Road, HAL II Stage, Bengaluru 560008, Karnataka, India",
} as const;

/** "operated by Asanoha LLP (LLPIN ADE-0939), a limited liability partnership registered in India with its registered office at …" */
export const OPERATED_BY = `operated by ${OPERATOR.name} (LLPIN ${OPERATOR.llpin}), a limited liability partnership registered in India with its registered office at ${OPERATOR.address}`;

export const GRIEVANCE = `Grievance Officer, ${OPERATOR.name}, ${OPERATOR.address}. Email: ${OPERATOR.grievanceEmail}.`;

export const COPYRIGHT = `© 2026 ${OPERATOR.name} · LLPIN ${OPERATOR.llpin} · Bengaluru, India`;
