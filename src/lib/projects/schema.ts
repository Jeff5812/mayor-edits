// Shared by the admin form and the server actions, and kept in step with the database checks.
export interface ProjectInput {
  title: string;
  description: string;
  category: string;
  language: string;
  is_featured: boolean;
}

export type FieldErrors = Record<string, string>;

export type ParsedProject = { ok: true; data: ProjectInput } | { ok: false; fieldErrors: FieldErrors };

// Server actions receive whatever the browser sent, so nothing here assumes the types are right.
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseProjectInput(input: Partial<Record<keyof ProjectInput, unknown>>): ParsedProject {
  const data: ProjectInput = {
    title: text(input.title),
    description: text(input.description),
    category: text(input.category),
    language: text(input.language),
    is_featured: input.is_featured === true,
  };

  const fieldErrors: FieldErrors = {};
  if (!data.title) fieldErrors.title = "Please enter a title.";
  else if (data.title.length > 160) fieldErrors.title = "Titles can be up to 160 characters.";
  if (data.description.length > 2000) fieldErrors.description = "Descriptions can be up to 2000 characters.";
  if (!data.category) fieldErrors.category = "Please enter a category.";
  else if (data.category.length > 60) fieldErrors.category = "Categories can be up to 60 characters.";
  if (data.language.length > 60) fieldErrors.language = "Languages can be up to 60 characters.";

  return Object.keys(fieldErrors).length > 0 ? { ok: false, fieldErrors } : { ok: true, data };
}
