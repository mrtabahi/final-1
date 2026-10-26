-- Public, privacy-safe plan display details for the account upgrade dialog.
-- Only active plan metadata and entitlement category counts are returned; resource IDs and user records stay private.
CREATE OR REPLACE FUNCTION public.get_active_subscription_plan_details()
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  price_minor bigint,
  currency text,
  duration_days integer,
  entitlements jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT
    sp.id,
    sp.name,
    sp.description,
    sp.price_minor,
    sp.currency,
    sp.duration_days,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'resource_type', grouped.resource_type,
          'count', grouped.entitlement_count,
          'label', CASE grouped.resource_type
            WHEN 'site' THEN 'Site-wide access'
            WHEN 'menu' THEN 'Menu access'
            WHEN 'submenu' THEN 'Section access'
            WHEN 'folder' THEN grouped.entitlement_count::text || CASE WHEN grouped.entitlement_count = 1 THEN ' folder' ELSE ' folders' END
            WHEN 'test' THEN grouped.entitlement_count::text || CASE WHEN grouped.entitlement_count = 1 THEN ' typing test' ELSE ' typing tests' END
            WHEN 'materials' THEN 'Study materials access'
            ELSE 'Configured access'
          END
        )
        ORDER BY grouped.resource_type
      )
      FROM (
        SELECT pe.resource_type, count(*)::integer AS entitlement_count
        FROM public.plan_entitlements AS pe
        WHERE pe.plan_id = sp.id
        GROUP BY pe.resource_type
      ) AS grouped
    ), '[]'::jsonb) AS entitlements
  FROM public.subscription_plans AS sp
  WHERE sp.is_active = true
  ORDER BY sp.price_minor, sp.duration_days, sp.name;
$function$;

REVOKE ALL ON FUNCTION public.get_active_subscription_plan_details() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_subscription_plan_details() TO anon, authenticated;
