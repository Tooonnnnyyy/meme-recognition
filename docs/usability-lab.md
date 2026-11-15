# Usability Lab

`lab.html` is the researcher workspace: plan a study, run moderated sessions on this computer, and get the documents and the report. It complements the participant runtime (`research.html`), which runs unmoderated sessions from a link.

Everything is stored in this browser's IndexedDB on the researcher's computer. Nothing is uploaded. Use **Export** (one study) or **Back up all** to save a package file, and **Import** to restore it on another computer. Import checks the whole file before it writes anything, so a damaged package changes nothing. A study changed later on this computer than in the package is kept, and so is a session here whose copy holds more reviews.

## Flow

1. **Studies.** Create a study, or try the demo study (the Northwind shop with three planted problems).
2. **Plan.**
   - Method: moderated on this computer, or unmoderated by link.
   - What participants use:
     - any prototype or app (observed: a live website, a mobile app, ProtoPie, Axure, paper);
     - a Figma prototype (embedded; with a client ID, clicks and frames are recorded);
     - the demo shop (embedded and recorded).
   - Tasks: what the participant reads, what success looks like (written before the sessions, so every participant is judged the same way), a time limit, and for Figma optional start and goal frames.
     - A moderated study can have up to 12 tasks of up to 60 minutes each. An unmoderated study travels inside its link, so it can have up to 10 tasks of up to 30 minutes each.
   - Questions: the Single Ease Question after each task; SUS, UMUX-Lite or nothing at the end.
   - Counterbalancing (moderated studies only): a Williams Latin square, so each task comes first equally often and follows every other task equally often. It is fully balanced when the number of participants is a multiple of the number of orders (the number of tasks, or twice that for an odd number).
   - The number of planned participants.
3. **Documents.**
   - A consent form draft with the elements TCPS 2 Article 3.2 asks for, filled from the study settings. What only you know (the funder or sponsor, conflicts of interest, commercialization, limits of confidentiality) is left in [brackets] for you to fill in.
   - A data management statement saying where each kind of data is stored, who sees it and how long it is kept.
   - Both cover the optional webcam numbers (gaze estimates and face movement) of unmoderated sessions, and what Figma receives when it shows a Figma prototype.
   - Both are drafts to adapt to your ethics board's template.
4. **Run (moderated).**
   - One slot per planned participant (P01, P02…), each with its counterbalanced task order, plus pilot sessions, which stay out of the report.
   - The console shows the task to the participant and the moderator panel beside it: success criteria, outcome buttons, quick notes.
   - Keys:
     - Notes: `N` note, `P` problem, `Q` quote, `A` assist, `E` error. Type the note and press `Enter` to add it; `Esc` leaves the note field. Words starting with `#` become tags.
     - Outcomes: `1` success, `2` partial success, `3` failed or gave up, `4` skipped.
     - `Enter` starts a task.
     - The keys work while the Lab page has the keyboard. After the participant clicks in the prototype, the panel says so; click anywhere in the moderator panel to use the keys again.
   - Every note and outcome is saved as it happens. Leaving a session before it ends (Back, closing the tab) asks first; an unfinished session shows as unfinished on Run, where you can discard it, and its slot stays free.
5. **Run (unmoderated).** Copy the participant link (Figma studies need a client ID), then add the results files participants send back.
6. **Results.**
   - Every session, to review, download or delete.
   - Reviews made on the review screen are saved back to the workspace automatically.
7. **Report.** The study report adds three things for moderated studies:
   - completion counts that include partial success;
   - **observed problems**: notes of kind problem, error or assist, grouped across participants by tag (or by identical text when untagged), with how many participants hit each and example notes;
   - every quote, under "What participants said".

   Pilot sessions and unfinished sessions are left out unless you include them. Results files are added on Run; the report has no file picker. UMUX-Lite is shown on its own scale and as its SUS equivalent (0.65 × raw + 22.9, Lewis, Utesch & Maher 2013), graded on the same Sauro–Lewis curve.

## Session file additions

Moderated sessions use the same session format, with these additions:
- `mode: 'moderated'`, `pilot`, `consentConfirmedAt`, `taskOrder` and `finishedAt`;
- `notes: [{ t, taskId, kind, text, tags }]`;
- task outcomes `partial` and `failed`;
- `umuxLite: { answers, raw, sus }`;
- for studies with nothing embedded, `study.kind: 'observed'`.
