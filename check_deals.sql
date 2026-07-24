SELECT signal_type, COUNT(*) 
FROM signals 
WHERE investment_relevance_score >= 0.5 
GROUP BY signal_type 
ORDER BY COUNT(*) DESC;
