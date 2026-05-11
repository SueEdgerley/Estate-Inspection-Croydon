#!/usr/bin/env node

// Test script to debug ESM template patching
import Airtable from 'airtable';
import { applyEsmInspectionFormPatch, isEsmInspectionFormTemplate } from './lib/esm-inspection-form.js';

const AT_API_KEY = process.env.AIRTABLE_API_KEY;
const AT_BASE_ID = process.env.AIRTABLE_BASE_ID;

if (!AT_API_KEY || !AT_BASE_ID) {
  console.error('AIRTABLE_API_KEY and AIRTABLE_BASE_ID environment variables are required');
  process.exit(1);
}

const base = new Airtable({ apiKey: AT_API_KEY }).base(AT_BASE_ID);

async function getEsmTemplate() {
  const records = [];
  console.log('Fetching templates...');
  
  try {
    await base('Templates')
      .select({
        filterByFormula: `{Form Type} = 'ESM Inspector'`,
        maxRecords: 1,
      })
      .eachPage((page, fetchNextPage) => {
        records.push(...page);
        fetchNextPage();
      });
  } catch (err) {
    console.error('Error fetching templates:', err.message);
    process.exit(1);
  }

  if (!records.length) {
    console.error('No ESM template found');
    process.exit(1);
  }

  const template = records[0].fields;
  const templateId = records[0].id;
  console.log(`Found template: ${template.Title} (${templateId})`);

  // Fetch linked sections
  const sectionIds = template['Sections'] || [];
  console.log(`Loading ${sectionIds.length} sections...`);

  const sections = await Promise.all(
    sectionIds.map((id) =>
      base('Sections')
        .find(id)
        .then((rec) => ({ ...rec.fields, id: rec.id }))
        .catch((err) => {
          console.error(`Failed to load section ${id}: ${err.message}`);
          return null;
        })
    )
  );

  // Fetch questions for each section
  const fullSections = await Promise.all(
    sections
      .filter(Boolean)
      .map(async (section) => {
        const questionIds = section['Questions'] || [];
        const questions = await Promise.all(
          questionIds.map((id) =>
            base('Questions')
              .find(id)
              .then((rec) => ({ ...rec.fields, id: rec.id }))
              .catch((err) => {
                console.error(`Failed to load question ${id}: ${err.message}`);
                return null;
              })
          )
        );
        return { ...section, questions: questions.filter(Boolean) };
      })
  );

  return {
    ...template,
    id: templateId,
    sections: fullSections.filter(Boolean),
  };
}

async function main() {
  const template = await getEsmTemplate();

  console.log('\n=== TEMPLATE BEFORE PATCH ===');
  console.log(`Total sections: ${template.sections.length}`);
  
  let issueQuestionCount = 0;
  template.sections.forEach((section, sidx) => {
    const sectionName = section.Title || section.Name || `Section ${sidx}`;
    console.log(`\n[${sidx}] ${sectionName}:`);
    console.log(`  Questions: ${section.questions.length}`);
    section.questions.forEach((q, qidx) => {
      const qtext = q['Question Text'] || q.Label || q.question_text || '';
      const hasHealth = qtext.toLowerCase().includes('health');
      const hasSafety = qtext.toLowerCase().includes('safety');
      const hasIssues = qtext.toLowerCase().includes('issues');
      const isIssueQ = (hasHealth || hasSafety) && hasIssues;
      if (isIssueQ) issueQuestionCount++;
      const marker = isIssueQ ? ' [ISSUE Q]' : '';
      console.log(`    Q${qidx}: ${qtext.substring(0, 60)}${marker}`);
    });
  });

  console.log(`\nTotal issue questions before patch: ${issueQuestionCount}`);

  console.log('\n=== APPLYING PATCH ===');
  applyEsmInspectionFormPatch(template);

  console.log('\n=== TEMPLATE AFTER PATCH ===');
  console.log(`Total sections: ${template.sections.length}`);
  
  let hiddenCount = 0;
  let issueQuestionCountAfter = 0;
  template.sections.forEach((section, sidx) => {
    const sectionName = section.Title || section.Name || `Section ${sidx}`;
    const visibleQuestions = section.questions.filter((q) => !q.esm_hidden && !q.nv_hidden);
    const hiddenQuestions = section.questions.filter((q) => q.esm_hidden || q.nv_hidden);

    if (hiddenQuestions.length > 0) {
      console.log(`\n[${sidx}] ${sectionName}:`);
      console.log(`  Total questions: ${section.questions.length}`);
      console.log(`  Visible: ${visibleQuestions.length}, Hidden: ${hiddenQuestions.length}`);
      
      hiddenQuestions.forEach((q, qidx) => {
        const qtext = q['Question Text'] || q.Label || q.question_text || '';
        console.log(`    [HIDDEN] ${qtext.substring(0, 60)}`);
        hiddenCount++;
      });
      
      visibleQuestions.forEach((q, qidx) => {
        const qtext = q['Question Text'] || q.Label || q.question_text || '';
        const hasHealth = qtext.toLowerCase().includes('health');
        const hasSafety = qtext.toLowerCase().includes('safety');
        const hasIssues = qtext.toLowerCase().includes('issues');
        const isIssueQ = (hasHealth || hasSafety) && hasIssues;
        if (isIssueQ) issueQuestionCountAfter++;
      });
    }
  });

  console.log(`\nTotal questions hidden: ${hiddenCount}`);
  console.log(`Total visible issue questions after patch: ${issueQuestionCountAfter}`);

  // Detailed look at Health and Safety section
  const hsSectionAfter = template.sections.find((s) => {
    const name = (s.Title || s.Name || '').toLowerCase();
    return name.includes('health') && name.includes('safety');
  });

  if (hsSectionAfter) {
    console.log('\n=== HEALTH AND SAFETY SECTION DETAIL ===');
    console.log(`Name: ${hsSectionAfter.Title || hsSectionAfter.Name}`);
    console.log(`Total questions: ${hsSectionAfter.questions.length}`);
    hsSectionAfter.questions.forEach((q, idx) => {
      const qtext = q['Question Text'] || q.Label || q.question_text || '';
      const type = q['Question Type'] || q.question_type || 'unknown';
      const hidden = q.esm_hidden || q.nv_hidden ? '✓ HIDDEN' : '';
      console.log(`  Q${idx}: [${type}] ${qtext.substring(0, 50)}... ${hidden}`);
    });
  }
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
