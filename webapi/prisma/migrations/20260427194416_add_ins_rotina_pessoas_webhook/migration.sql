-- AlterTable
ALTER TABLE "INSInstituicao" ADD COLUMN     "INSRotinaPessoasCodigo" INTEGER;

-- AddForeignKey
ALTER TABLE "INSInstituicao" ADD CONSTRAINT "INSInstituicao_INSRotinaPessoasCodigo_fkey" FOREIGN KEY ("INSRotinaPessoasCodigo") REFERENCES "ROTRotina"("ROTCodigo") ON DELETE SET NULL ON UPDATE CASCADE;
