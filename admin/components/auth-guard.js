import { supabase } from "./supabase-client.js";

export async function requireAuthenticatedUser() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (!session?.user) {
    const destination = encodeURIComponent(
      window.location.pathname +
      window.location.search
    );

    window.location.replace(
      `sigprevi-login.html?redirect=${destination}`
    );

    return null;
  }

  return session.user;
}

export async function redirectAuthenticatedUser() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  if (session?.user) {
    window.location.replace("sigprevi.html");
    return true;
  }

  return false;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw error;
  }

  window.location.replace("sigprevi-login.html");
}