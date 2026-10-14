// Each person's files live in one folder: "LASTNAME, Firstname — REFERENCE".
// The reference number keeps two people with the same name apart.

export function personFolderName(lastName: string, firstName: string, reference: string) {
  return `${lastName.trim().toUpperCase()}, ${firstName.trim()} — ${reference}`;
}

// Supabase Storage only accepts plain characters in paths: drop accents, swap the long dash.
export function storageSafe(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/—/g, "-")
    .replace(/[^A-Za-z0-9 ,.\-_()'&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
