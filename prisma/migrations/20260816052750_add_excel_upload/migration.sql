-- CreateTable
CREATE TABLE "ExcelUpload" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "uploadedById" TEXT,
    "snapshot" TEXT NOT NULL,
    "savedProjectId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExcelUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExcelUpload_createdAt_idx" ON "ExcelUpload"("createdAt");

-- AddForeignKey
ALTER TABLE "ExcelUpload" ADD CONSTRAINT "ExcelUpload_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
