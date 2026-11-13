/** Who operates Kosmik (a product of Asanoha) and how to reach them. Shown on the legal pages. */
export const OPERATOR = {
  name: "Shri Krishna Enterprises",
  gstin: "09AQAPS4921Q1Z7",
  email: "pankaj@asanoha.co.in",
  phone: "+91 94118 66742",
  address: "23 B Vaibhar Vihar Colony, Etawah, Uttar Pradesh 206001",
} as const;

export const GRIEVANCE = `Grievance Officer, ${OPERATOR.name}: ${OPERATOR.email}, ${OPERATOR.phone}.`;
