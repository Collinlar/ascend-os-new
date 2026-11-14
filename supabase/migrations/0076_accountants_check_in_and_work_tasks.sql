-- ---------------------------------------------------------------------------
-- 0076  Accountants can check in and work their own tasks
--
-- The role matrix approved on 14 Nov 2026 (PHASE_1_PLAN.md 3.4) gave
-- accountants no attendance.own and no tasks.own. The step 1b route-by-role
-- run showed that today an accountant can check themselves in, and an
-- accountant is a member of the team like anyone else. Collins decided on
-- 14 Nov 2026 that accountants get both.
--
-- Applied to the accountant template and every business's copy. Added only
-- where missing, so running it twice changes nothing. The 0074 trigger checks
-- both keys exist in the catalogue.
--
-- Tables and columns touched: role.key, role.permissions.
-- ---------------------------------------------------------------------------

update role
   set permissions = permissions || (
         select coalesce(jsonb_agg(k), '[]'::jsonb)
         from unnest(array['attendance.own', 'tasks.own']) k
         where not (role.permissions ? k)
       )
 where key = 'accountant';
