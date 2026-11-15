# Usability Lab

`lab.html` is the researcher workspace: plan a study, run moderated sessions on this computer, and get the documents and the report. It complements the participant runtime (`research.html`), which runs unmoderated sessions from a link.

Everything is stored in this browser's IndexedDB on the researcher's computer. Nothing is uploaded. Use **Export** (one study) or **Back up all** to save a package file, and **Import** to restore it on another computer.

## Flow

1. **Studies.** Create a study, or try the demo study (the Northwind shop with three planted problems).
2. **Plan.**
   - Method: moderated on this computer, or unmoderated by link.
   - What participants use:
     - any prototype or app (observed: a live website, a mobile app, ProtoPie, Axure, paper);
     - a Figma prototype (embedded; with a client ID, clicks and frames are recorded);
     - the demo shop (embedded and recorded).
   - Tasks: what the participant reads, what success looks like (written before the sessions, so every participant is judged the same way), a time limit, and for Figma optional start and goal frames.
   - Questions: the Single Ease Question after each task; SUS, UMUX-Lite or nothing at the end.
   - Counterbalancing: a Williams Latin square, so each task comes first equally often and follows every other task equally often.
   - The number of planned participants.
3. **Documents.**
   - A consent form draft with the elements TCPS 2 Article 3.2 asks for, filled from the study settings.
   - A data management statement saying where each kind of data is stored, who sees it and how long it is kept.
   - Both are drafts to adapt to your ethics board's template.
4. **Run (moderated).**
   - One slot per planned participant (P01, P02…), each with its counterbalanced task order, plus pilot sessions, which stay out of the report.
   - The console shows the task to the participant and the moderator panel beside it: success criteria, outcome buttons, quick notes.
   - Keys:
     - Notes: `N` note, `P` problem, `Q` quote, `A` assist, `E` error. Type the note and press `Enter`. Words starting with `#` become tags.
     - Outcomes: `1` success, `2` partial success, `3` failed or gave up, `4` skipped.
     - `Enter` starts a task.
   - Every note and outcome is saved as it happens.
5. **Run (unmoderated).** Copy the participant link (Figma studies need a client ID), then add the results files participants send back.
6. **Results.**
   - Every session, to review, download or delete.
   - Reviews made on the review screen are saved back to the workspace automatically.
7. **Report.** The study report adds three things for moderated studies:
   - completion counts that include partial success;
   - **observed problems**: notes of kind problem, error or assist, grouped across participants by tag (or by identical text when untagged), with how many participants hit each and example notes;
   - every quote, under "What participants said".

   Pilot sessions are left out unless you include them. UMUX-Lite is shown on its own scale and as its SUS equivalent (0.65 × raw + 22.9, Lewis, Utesch & Maher 2013), graded on the same Sauro–Lewis curve.

## Session file additions

Moderated sessions use the same session format, with these additions:
- `mode: 'moderated'`, `pilot`, `consentConfirmedAt`, `taskOrder` and `finishedAt`;
- `notes: [{ t, taskId, kind, text, tags }]`;
- task outcomes `partial` and `failed`;
- `umuxLite: { answers, raw, sus }`;
- for studies with nothing embedded, `study.kind: 'observed'`.
