BEGIN;

ALTER FUNCTION public.legislation_admin_list_documents(
    text,
    integer,
    text,
    boolean,
    text
)
VOLATILE;

ALTER FUNCTION public.legislation_admin_get_document(
    uuid
)
VOLATILE;

COMMIT;