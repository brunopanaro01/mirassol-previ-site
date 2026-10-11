export const PASSWORD_ADMIN_EMAIL = "brunopanaro@gmail.com";
export async function resetOtherPassword({ authorization, body, createCaller, createAdmin, audit }) {
  if (!authorization?.startsWith("Bearer ")) return { status: 401, error: "Autenticação necessária." };
  const caller = createCaller(authorization);
  const { data, error } = await caller.auth.getUser();
  const actor = data?.user;
  if (error || !actor || actor.email?.toLowerCase() !== PASSWORD_ADMIN_EMAIL || !actor.email_confirmed_at)
    return { status: 403, error: "Operação restrita ao responsável autorizado." };
  const { data: users, error: accessError } = await caller.rpc("access_admin_list_users");
  if (accessError || !Array.isArray(users) || !users.some(u => u.user_id === actor.id && u.account_status === "active"))
    return { status: 403, error: "Operação restrita ao responsável autorizado." };
  if (!body || typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128 ||
      typeof body.userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId))
    return { status: 400, error: "Informe um usuário válido e uma senha de 8 a 128 caracteres." };
  if (body.userId === actor.id) return { status: 400, error: "Use Alterar minha senha para sua própria conta." };
  if (!users.some(u => u.user_id === body.userId && u.account_status === "active"))
    return { status: 404, error: "Usuário ativo não encontrado." };
  const { error: updateError } = await createAdmin().auth.admin.updateUserById(body.userId, { password: body.password });
  audit({ action: "admin_password_change", actor: actor.id, target: body.userId, success: !updateError });
  if (updateError) return { status: 400, error: "Não foi possível alterar a senha. Confira as regras de segurança e tente novamente." };
  return { status: 200, success: true };
}
