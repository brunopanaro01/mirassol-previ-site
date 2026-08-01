import { createClient } from
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

import { SIGPREVI_CONFIG } from
  "../sigprevi-config.local.js";

function validateConfig() {
  const {
    supabaseUrl,
    supabasePublishableKey
  } = SIGPREVI_CONFIG;

  if (
    !supabaseUrl ||
    !supabasePublishableKey ||
    supabaseUrl.includes("COLE_") ||
    supabasePublishableKey.includes("COLE_")
  ) {
    throw new Error(
      "A configuração local do Supabase " +
      "ainda não foi preenchida."
    );
  }

  let parsedUrl;

  try {
    parsedUrl = new URL(supabaseUrl);
  } catch {
    throw new Error(
      "A URL configurada para o Supabase é inválida."
    );
  }

  if (
    !["http:", "https:"].includes(parsedUrl.protocol)
  ) {
    throw new Error(
      "O protocolo da URL do Supabase é inválido."
    );
  }

  if (
    supabasePublishableKey.startsWith("sb_secret_") ||
    supabasePublishableKey.includes("service_role")
  ) {
    throw new Error(
      "Foi informada uma chave secreta. " +
      "Use somente a chave Publishable."
    );
  }
}

validateConfig();

export const supabase = createClient(
  SIGPREVI_CONFIG.supabaseUrl,
  SIGPREVI_CONFIG.supabasePublishableKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);