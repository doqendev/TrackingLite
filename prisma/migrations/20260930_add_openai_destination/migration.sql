-- Commit the enum addition before any subsequent migration can use it.
ALTER TYPE "Destination" ADD VALUE 'OPENAI';
