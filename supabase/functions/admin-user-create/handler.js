const OWNER = "brunopanaro@gmail.com";
const denied = { status: 403, error: "Operação restrita ao responsável autorizado." };

export async function createSigpreviUser({ authorization, body, createCaller, createAdmin, audit }) {
  if (!authorization?.startsWith("Bearer ")) return { status: 401, error: "Autenticação necessária." };
  const caller = createCaller(authorization);
  const { data, error } = await caller.auth.getUser();
  const actor = data?.user;
  if (error || !actor || actor.email?.toLowerCase() !== OWNER || !actor.email_confirmed_at) return denied;
  const { data: users, error: accessError } = await caller.rpc("access_admin_list_users");
  if (accessError || !Array.isArray(users) || !users.some(u => u.user_id === actor.id && u.account_status === "active")) return denied;
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body?.fullName === "string" ? body.fullName.trim() : "";
  const role = body?.role ?? null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || name.length < 2 || name.length > 150 ||
      typeof body?.password !== "string" || body.password.length < 8 || body.password.length > 128 ||
      (role !== null && role !== "investments_committee"))
    return { status: 400, error: "Confira o nome, e-mail, senha de 8 a 128 caracteres e perfil selecionado." };
  if (users.some(u => u.email?.toLowerCase() === email))
    return { status: 409, error: "Este e-mail já possui cadastro. Utilize o usuário existente." };
  // Confirmado administrativamente: não depende de serviço de e-mail.
  // O trigger existente cria app.users; nunca criar/alterar perfil manualmente aqui.
  const { data: created, error: creationError } = await createAdmin().auth.admin.createUser({
    email, password: body.password, email_confirm: true, user_metadata: { full_name: name }
  });
  if (creationError || !created?.user?.id) {
    audit({ action: "admin_user_create", actor: actor.id, success: false });
    return { status: 400, error: "Não foi possível cadastrar. Confira se o e-mail já existe e as regras da senha." };
  }
  const target = created.user.id;
  audit({ action: "admin_user_create", actor: actor.id, target, success: true });
  if (role) {
    // A RPC existente verifica novamente o administrador e registra a concessão.
    const { error: roleError } = await caller.rpc("access_admin_grant_module_role", { p_user_id: target, p_role_name: role });
    if (roleError) return { status: 201, success: true, roleAssigned: false,
      message: "Usuário cadastrado. O acesso ao Comitê não foi concedido; use Gerenciar módulos no cadastro existente." };
  }
  return { status: 201, success: true, roleAssigned: Boolean(role),
    message: role ? "Usuário cadastrado com acesso ao Comitê de Investimentos." : "Usuário cadastrado. Conceda os acessos necessários em Gerenciar módulos." };
}
