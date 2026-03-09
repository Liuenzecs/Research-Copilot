from __future__ import annotations


def paper_template() -> dict:
    return {
        'related_paper': '',
        'record_time': '',
        'reading_stage': '',
        'paper_in_my_words': '',
        'most_important_contribution': '',
        'what_i_learned': '',
        'what_i_do_not_understand': '',
        'worth_reproducing': '',
        'worth_reporting_to_professor': '',
        'one_sentence_report_summary': '',
        'free_notes': '',
    }


def reproduction_template() -> dict:
    return {
        'related_target': '',
        'record_time': '',
        'reproduction_stage': '',
        'what_i_did_today': '',
        'current_result': '',
        'issues_encountered': '',
        'suspected_causes': '',
        'next_step': '',
        'worth_reporting_to_professor': '',
        'one_sentence_report_summary': '',
        'free_notes': '',
    }


def get_template(template_type: str) -> dict:
    if template_type == 'reproduction':
        return reproduction_template()
    return paper_template()
