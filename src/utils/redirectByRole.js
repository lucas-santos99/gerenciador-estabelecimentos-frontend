// src/utils/redirectByRole.js
export function redirectByRole(profile) {
  if (!profile) return "/login";

  switch (profile.role) {
    case "super_admin":
      return "/admin";

    case "merchant":
      return `/estabelecimentos/${profile.mercearia_id}`;

    case "operator":
      return `/estabelecimentos/${profile.mercearia_id}`;

    default:
      return "/";
  }
}
