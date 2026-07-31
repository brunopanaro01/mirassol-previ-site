SELECT
    routine_name
FROM information_schema.routines
WHERE routine_schema = 'app'
  AND routine_name IN (
      'has_role',
      'has_permission',
      'has_module_access',
      'is_admin'
  )
ORDER BY routine_name;