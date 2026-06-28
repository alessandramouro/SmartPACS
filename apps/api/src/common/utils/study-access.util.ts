import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtPayload } from '@smartpacs/types';

import { PrismaService } from '../../prisma/prisma.service';

export function assertStudyAccess(study: { clinicId: string }, currentUser: JwtPayload): void {
  if (
    currentUser.role !== 'SUPER_ADMIN' &&
    currentUser.role !== 'TENANT_ADMIN' &&
    currentUser.clinicId &&
    study.clinicId !== currentUser.clinicId
  ) {
    throw new ForbiddenException('Access denied to this study');
  }
}

/**
 * Looks up a study by its DICOM StudyInstanceUID, scoped to the current
 * user's tenant, for callers (like the DICOMweb proxy) that only have the
 * UID available rather than our internal study id.
 */
export async function findAccessibleStudyByUid(
  prisma: PrismaService,
  studyInstanceUid: string,
  currentUser: JwtPayload,
) {
  const where =
    currentUser.role === 'SUPER_ADMIN'
      ? { studyInstanceUid }
      : { studyInstanceUid, tenantId: currentUser.tenantId };

  const study = await prisma.study.findFirst({ where });
  if (!study) throw new NotFoundException('Study not found');
  assertStudyAccess(study, currentUser);

  return study;
}
