-- A sub-con login also reads his own scaffolding material entries (owner, 2026-11-21)
drop policy if exists app_records_read on public.app_records;
create policy app_records_read on public.app_records for select to authenticated
  using (
    private.is_active_user() and not private.has_any_role('labourer', 'subcontractor')
    or (
      private.has_any_role('subcontractor') and (
        (collection = 'work.reports' and data->>'submitterId' in (select private.my_subcon_staff()))
        or (collection in ('work.dprs', 'work.jobs', 'work.planLines', 'work.scaffoldJobs', 'work.scaffoldPlanLines') and data->>'supervisorId' in (select private.my_subcon_staff()))
        or (collection in ('ops.subconRequests', 'work.scaffoldMaterial') and data->>'contractorId' = private.my_contractor_id())
        or collection in ('ops.plantRacks', 'work._meta')
      )
    )
  );
